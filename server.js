// FILE NAME: server.js
// Purpose: Generates Agora call tokens + serves a simple browser test page.

const express = require("express");
const cors = require("cors");
const path = require("path");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

const app = express();
app.use(cors());
app.use(express.json());

// Serves the test page at your server's main URL
app.use(express.static(path.join(__dirname, "public")));

// ---- CONFIG: these come from Replit "Secrets", not typed here directly ----
const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;
const TOKEN_EXPIRY_SECONDS = 60 * 30;

app.post("/generate-token", (req, res) => {
  const { channelName, uid } = req.body;

  if (!channelName) {
    return res.status(400).json({ error: "channelName is required" });
  }
  if (!APP_ID || !APP_CERTIFICATE) {
    return res.status(500).json({ error: "Server is missing AGORA_APP_ID or AGORA_APP_CERTIFICATE. Add them in Secrets." });
  }

  const role = RtcRole.PUBLISHER;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + TOKEN_EXPIRY_SECONDS;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid || 0,
      role,
      privilegeExpiredTs
    );
    return res.json({ token, appId: APP_ID, channelName, uid: uid || 0, expiresAt: privilegeExpiredTs });
  } catch (err) {
    console.error("Token generation failed:", err);
    return res.status(500).json({ error: "Failed to generate token" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
