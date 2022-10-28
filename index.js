const bodyParser = require('body-parser');
const express = require("express");
const app = express();
app.use(bodyParser.json());

const idGen = require('./res/idGen');
const lightOrDark = require('./res/lightOrDark');

const config = require('./config.json')

const superagent = require('superagent')

const jimp = require('jimp-native');

let images = {};

app.get(`/avatars/nyxified/:id.png`, async (req, res) => {
    const id = Object.keys(images).find(k => k.startsWith(req.params.id))
    console.log(req.params.id, id)
    if(images[id]) {
        res.writeHead(200, {
            "Content-Type": `image/png`,
            "Content-Length": images[id].length,
            "Content-disposition": `attachment;filename=${id}.png`
        }); res.end(images[id])
    } else {
        res.status(404).send(null) // replace this if you wish; this is only null because nyx's webserver handles http codes other than 2XX
    }
})

app.use((req, res, next) => {
    if((req.headers.auth || req.headers.authorization || req.headers.token) == config.nyxify.authentication) {
        next()
    } else res.status(401).send(`Authorization key either not provided, or is invalid!`)
});

let jimpImages = {
    overlay: `${__dirname}/nyxov-small.png`,
    border: `${__dirname}/nyx-border.png`,
    gradient: `${__dirname}/nyxgradient.png`
}

app.post(`/nyxify`, async (req, res) => {
    const beforeRender = Date.now();

    if(req.body && req.body.url && req.body.id) {
        const id = req.body.id + `-` + idGen(4)
        let imgurl = req.body.url;

        let img, overlay, border;

        await Promise.all([
            new Promise(async res => {
                img = await jimp.read((await superagent.get(imgurl)).body);
                res()
            }),
            new Promise(async res => {
                overlay = await jimpImages.overlay.clone();
                res()
            }),
            new Promise(async res => {
                border = await jimpImages.border.clone()
                res() 
            }),
        ]);  


        // determine whether or not the majority of the picture is light or dark;
        // if the majority is dark, invert the colors of the border & overlay
        const cp = await img.clone();
        cp.resize(10, 10);
        let x = 1, y = 1;
        let d = 0, t = 0;
        let done = false;
        while(!done) {
            const clr = await cp.getPixelColor(x, y);
            color = `#${((Number(`${clr}`.replace('0x', '')))).toString(16).substring(0, 6)}`;
            if(color === `#ff`) {color = `#000000`}
            const darkorlight = lightOrDark(color);
            if(darkorlight == `dark`) {d++; t++} else {t++};
            if(x === 9 && y === 10) {done = true;}
            x++; if(x > 10) {x = 1; y++}
        };
        const calc = Math.round((d/t)*100);
        console.log(calc)
        if(calc > 70) {
            overlay.invert();
            border.invert();
        }


        // crop the image to a 1:1 aspect ratio, and set the width & height to 700px
        // the image is set to 700px, because the overlay itself is 700px.

        const height = img.getHeight(), width = img.getWidth();
        if(height !== width) {
            if(height > width) {
                img.cover(height, height)
            } else if (width > height) {
                img.cover(width, width)
            }
        }
        img.resize(700, 700);


        if(req.body.color === true) {
            console.log(`colorize - true`)
            const gradient = await jimpImages.gradient.clone()
            img.composite(gradient, 0, 0, {
                mode: jimp.BLEND_OVERLAY
            })
        }


        // because the current state of the image looks insanely awkward, we'll
        // add the borders here. this increases the image size from 700px to 1024px
        img.composite(overlay, 0, 0);
        img.contain(1024, 700)
        img.contain(1024, 1024)
        img.composite(border, 0, 0);

        img.getBuffer(jimp.MIME_PNG, (err, buffer) => {
            if(err) {
                res.status(500).send({
                    id,
                    url: null
                }); console.error(e)
            } else {
                console.log(`Took ${Date.now() - beforeRender}ms to render!`)

                images[id] = buffer; setTimeout(() => {delete images[id]}, 30000);
    
                if(req.body.image) {
                    res.set(`Content-Type`, `image/png`).set(`Content-Length`, buffer.length).send(buffer)
                } else superagent.post(`http://${config.cacheAPIEndpoint.location}:${config.cacheAPIEndpoint.port}/saveFile`)
                    .set(`auth`, config.cacheAPIEndpoint.authentication)
                    .send({ url: `http://${config.nyxify.location}:${config.nyxify.port}/avatars/nyxified/${id}.png` })
                    .then(r => {
                        res.send({
                            id,
                            url: `https://cache.nyx.bot/nyxified/${id}`
                        })
                    }).catch(e => {
                        res.status(500).send({
                            id,
                            url: null
                        }); console.error(e)
                    })
            }
        })
    } else return res.send({error: `No URL or ID was included in the body!`})
});

Promise.all([
    ...Object.keys(jimpImages).map(img => new Promise(async res => {
        console.log(`Loading image "${img}" at ${jimpImages[img]}`);
        jimpImages[img] = await jimp.read(jimpImages[img]);
        console.log(`Successfully loaded "${img}!"`);
        res(jimpImages[img])
    }))
]).then(() => app.listen(config.nyxify.port, () => {
    console.log(`nyxify is online!`)
}))