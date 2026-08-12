const crypto = require("crypto");

function validateTelegramData(initData) {
    try {
        if (!initData) {
            return null;
        }

        const botToken = process.env.BOT_TOKEN;

        if (!botToken) {
            console.error("Telegram auth error: BOT_TOKEN is missing");
            return null;
        }

        const params = new URLSearchParams(initData);

        const receivedHash = params.get("hash");

        if (!receivedHash) {
            console.error("Telegram auth error: hash is missing");
            return null;
        }

        params.delete("hash");

        const dataCheckString = Array
            .from(params.entries())
            .sort(([keyA], [keyB]) =>
                keyA.localeCompare(keyB)
            )
            .map(([key, value]) =>
                `${key}=${value}`
            )
            .join("\n");

        const secretKey = crypto
            .createHmac("sha256", "WebAppData")
            .update(botToken)
            .digest();

        const calculatedHash = crypto
            .createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");

        const receivedBuffer =
            Buffer.from(receivedHash, "hex");

        const calculatedBuffer =
            Buffer.from(calculatedHash, "hex");

        if (
            receivedBuffer.length !==
            calculatedBuffer.length
        ) {
            console.error(
                "Telegram auth error: invalid hash length"
            );

            return null;
        }

        if (
            !crypto.timingSafeEqual(
                receivedBuffer,
                calculatedBuffer
            )
        ) {
            console.error(
                "Telegram auth error: invalid hash"
            );

            return null;
        }

        const userData =
            params.get("user");

        if (!userData) {
            console.error(
                "Telegram auth error: user is missing"
            );

            return null;
        }

        const user =
            JSON.parse(userData);

        return user;
    }

    catch (error) {
        console.error(
            "Telegram auth error:",
            error.message
        );

        return null;
    }
}

module.exports = {
    validateTelegramData
};