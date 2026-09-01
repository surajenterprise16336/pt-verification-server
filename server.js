// FILE NAME: server.js
// PURPOSE:
// 1. Generate Agora RTC tokens
// 2. Send Firebase Cloud Messaging notifications
// 3. Keep Firebase credentials outside the public repository

const express = require("express");
const cors = require("cors");
const path = require("path");

const {
    RtcTokenBuilder,
    RtcRole
} = require("agora-access-token");

const admin = require("firebase-admin");

const app = express();

app.use(cors());
app.use(express.json());


// ============================================================
// STATIC TEST PAGE
// ============================================================

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);


// ============================================================
// ENVIRONMENT VARIABLES
// ============================================================

const APP_ID =
    process.env.AGORA_APP_ID;

const APP_CERTIFICATE =
    process.env.AGORA_APP_CERTIFICATE;

const RENDER_API_SECRET =
    process.env.RENDER_API_SECRET;


// ============================================================
// CONSTANTS
// ============================================================

const TOKEN_EXPIRY_SECONDS =
    60 * 30;


// ============================================================
// FIREBASE ADMIN INITIALIZATION
// ============================================================

const FIREBASE_SERVICE_ACCOUNT =
    "/etc/secrets/firebase-adminsdk.json";

try {

    if (!admin.apps.length) {

        admin.initializeApp({

            credential:
                admin.credential.cert(
                    require(
                        FIREBASE_SERVICE_ACCOUNT
                    )
                )

        });

        console.log(
            "Firebase Admin initialized successfully."
        );
    }

} catch (error) {

    console.error(
        "Firebase Admin initialization failed:",
        error.message
    );

}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {

    res.json({

        success: true,

        message:
            "Padmashali Trust Verification Server is running.",

        agoraConfigured:
            !!APP_ID && !!APP_CERTIFICATE,

        firebaseConfigured:
            admin.apps.length > 0

    });

});


// ============================================================
// AGORA TOKEN
// ============================================================

app.post("/generate-token", (req, res) => {

    const {
        channelName,
        uid
    } = req.body;


    if (!channelName) {

        return res.status(400).json({

            success: false,

            error:
                "channelName is required"

        });

    }


    if (
        !APP_ID ||
        !APP_CERTIFICATE
    ) {

        return res.status(500).json({

            success: false,

            error:
                "Server is missing Agora configuration."

        });

    }


    const role =
        RtcRole.PUBLISHER;


    const currentTimestamp =
        Math.floor(
            Date.now() / 1000
        );


    const privilegeExpiredTs =
        currentTimestamp +
        TOKEN_EXPIRY_SECONDS;


    const agoraUid =
        Number(uid) || 0;


    try {

        const token =
            RtcTokenBuilder.buildTokenWithUid(

                APP_ID,

                APP_CERTIFICATE,

                channelName,

                agoraUid,

                role,

                privilegeExpiredTs

            );


        return res.json({

            success: true,

            token: token,

            appId: APP_ID,

            channelName: channelName,

            uid: agoraUid,

            expiresAt:
                privilegeExpiredTs

        });

    } catch (error) {

        console.error(
            "Token generation failed:",
            error
        );


        return res.status(500).json({

            success: false,

            error:
                "Failed to generate token"

        });

    }

});


// ============================================================
// SEND FCM VERIFICATION CALL
// ============================================================
//
// PHP server calls this endpoint.
//
// Required Authorization:
//
// Authorization: Bearer RENDER_API_SECRET
//
// Required JSON body:
//
// {
//     "deviceToken": "...",
//     "title": "Incoming Verification Call",
//     "body": "Padmashali Trust Admin is requesting a verification call. Tap to answer.",
//     "callId": "123",
//     "channelName": "PT_VERIFY_...",
//     "memberUid": "123456"
// }
//
// ============================================================

app.post(
    "/send-verification-call",
    async (req, res) => {

        try {

            // ------------------------------------------------
            // SECURITY CHECK
            // ------------------------------------------------

            const authHeader =
                req.headers.authorization || "";

            const expectedHeader =
                "Bearer " +
                RENDER_API_SECRET;


            if (
                !RENDER_API_SECRET ||
                authHeader !== expectedHeader
            ) {

                console.warn(
                    "Unauthorized verification notification request."
                );

                return res.status(401).json({

                    success: false,

                    message:
                        "Unauthorized."

                });

            }


            // ------------------------------------------------
            // REQUEST DATA
            // ------------------------------------------------

            const {

                deviceToken,

                title,

                body,

                callId,

                channelName,

                memberUid

            } = req.body;


            // ------------------------------------------------
            // VALIDATE DEVICE TOKEN
            // ------------------------------------------------

            if (!deviceToken) {

                return res.status(400).json({

                    success: false,

                    message:
                        "deviceToken is required."

                });

            }


            // ------------------------------------------------
            // VALIDATE CALL ID
            // ------------------------------------------------

            if (!callId) {

                return res.status(400).json({

                    success: false,

                    message:
                        "callId is required."

                });

            }


            // ------------------------------------------------
            // VALIDATE CHANNEL
            // ------------------------------------------------

            if (!channelName) {

                return res.status(400).json({

                    success: false,

                    message:
                        "channelName is required."

                });

            }


            // ------------------------------------------------
            // FIREBASE CHECK
            // ------------------------------------------------

            if (!admin.apps.length) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Firebase Admin is not initialized."

                });

            }


            // =================================================
            // FCM DATA-ONLY MESSAGE
            // =================================================
            //
            // IMPORTANT:
            //
            // We intentionally DO NOT use the FCM
            // "notification" payload here.
            //
            // MyFirebaseMessagingService in the Member App
            // will create the Android notification itself.
            //
            // This allows us to control:
            //
            // Notification title
            // Notification description
            // Notification channel
            // Notification tap action
            // IncomingVerificationCallActivity
            //
            // =================================================

            const message = {

                token: deviceToken,


                data: {

                    type:
                        "VERIFICATION_CALL",

                    call_id:
                        String(callId),

                    channel_name:
                        String(channelName),

                    member_uid:
                        String(memberUid || ""),

                    title:
                        title ||
                        "Incoming Verification Call",

                    body:
                        body ||
                        "Padmashali Trust Admin is requesting a verification call. Tap to answer."

                },


                android: {

                    priority:
                        "high"

                }

            };


            // ------------------------------------------------
            // SEND FCM
            // ------------------------------------------------

            const response =
                await admin
                    .messaging()
                    .send(message);


            console.log(
                "FCM verification call sent:",
                response
            );


            return res.json({

                success: true,

                message:
                    "Verification call notification sent.",

                messageId:
                    response

            });


        } catch (error) {

            console.error(
                "FCM send failed:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to send verification call notification.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// START SERVER
// ============================================================

const PORT =
    process.env.PORT || 3000;


app.listen(
    PORT,
    () => {

        console.log(
            `Verification server listening on port ${PORT}`
        );

    }
);
