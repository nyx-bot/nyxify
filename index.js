const bodyParser = require('body-parser');
const express = require("express");
const app = express();
app.use(bodyParser.json());

app.post(`/nyxify`, async (req, res) => {
    
})