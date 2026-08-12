require("dotenv").config({
    path: "../.env"
});


const express = require("express");
const cors = require("cors");


const { validateTelegramData } = require("./telegramAuth");


const app = express();


const PORT = process.env.PORT || 3000;



// Middleware

app.use(cors());

app.use(express.json());



// Health check

app.get("/", (req, res) => {

    res.json({

        status: "ClientFlow backend is running",

        version: "1.0.0"

    });

});



// Telegram auth

app.post("/api/auth", (req, res) => {


    const { initData } = req.body;



    if (!initData) {

        return res.status(400).json({

            success:false,

            message:"Missing Telegram initData"

        });

    }



    const user = validateTelegramData(initData);



    if (!user) {

        return res.status(401).json({

            success:false,

            message:"Invalid Telegram data"

        });

    }



    res.json({

        success:true,

        user

    });


});




// Start

app.listen(PORT, () => {

    console.log(
        `ClientFlow backend running on port ${PORT}`
    );

});