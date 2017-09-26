/**
 * @author Rabah Zeineddine
 */


var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var request = require('request');
var moment = require('moment');


app.use(bodyParser.json());
var port = process.env.PORT || 5000;
app.set('port', port);


// var fs = require('fs')
//     , ursa = require('ursa');
// key = ursa.createPrivateKey(fs.readFileSync('./key.pem'));

require('dotenv').load(); // Load .env file to process.. 


// Facebook's Webhook validation 
app.get('/facebook/receive', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === process.env.FB_ACCESS_TOKEN) {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
});

// Facebook receive messages
app.post('/facebook/receive', function (req, res) {
    var data = req.body;
    // Make sure this is a page subscription
    if (data.object === 'page') {
        // Iterate over each entry - there may be multiple if batched
        data.entry.forEach(function (entry) {
            var pageID = entry.id;
            var timeOfEvent = entry.time;
            // Iterate over each messaging event
            if (entry.messaging) {
                entry.messaging.forEach(function (event) {
                    if (event.message && pageID != event.sender.id) {
                        console.log('Received text message. ');
                        var senderID = event.sender.id;
                        var messageText = event.message.text;
                        sendTextMessage(senderID, messageText);
                    } else if (event.referral) {
                        // Get Hash params using facebook messenger link..
                        saveHashAndRepresentativeOnContext(event);
                    } else {
                        // console.log("Webhook received unknown event: ");
                    }
                });
            } else if (entry.standby) {
                entry.standby.forEach(function (event) {
                    if (event.postback) {
                        console.log(event);
                        receivedPostback(event);
                    }
                })
            }
        });
        res.sendStatus(200);
    }
});


function receivedPostback(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfPostback = event.timestamp;

    // The 'payload' param is a developer-defined field which is set in a postback 
    // button for Structured Messages. 
    var title = event.postback.title;
    console.log("Received postback for user %d and page %d with payload '%s' " +
        "at %d", senderID, recipientID, title, timeOfPostback);
    // When a postback is called, we'll send a message back to the sender to 
    // let them know it was successful
    sendTextMessage(senderID, title);
}


function sendTextMessage(recipientId, messageText) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: messageText
        }
    };
    var options = {
        uri: process.env.NODE_RED_URL,
        method: 'POST',
        json: messageData
    }

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            reactToContextAction(messageData, body);
        } else {
            messageData.message.text = 'Um erro ocorreu, tente mais tarde!';
            callSendAPI(messageData);
        }
    }
    request(options, callback);
}

function reactToContextAction(messageData, watsonData) {
    console.log(watsonData.intents)
    // Check the distance between intentions and react in multiple intentions.
    if (.25 > (watsonData.intents[0].confidence - watsonData.intents[1].confidence) && .25 > (watsonData.intents[0].confidence - watsonData.intents[2].confidence) && watsonData.output.nodes_visited[0] != 'Em outros casos' && !watsonData.output.flow) {
        if (watsonData.output.attachments) {
            watsonData.output.attachments.push({
                "type": "text/quick_reply",
                "value": `Certo identifiquei que você também quer falar sobre *${watsonData.intents[1].intent.replace('_',' ')}* e *${watsonData.intents[2].intent.replace('_',' ')}*. Então me responda, sobre qual deles vamos conversar agora?`,
                "quick_replies": [{
                        "title": `${watsonData.intents[1].intent.replace('_',' ')}`,
                        "payload": `button_${watsonData.intents[1].intent}`,
                        "content_type": "text"
                    },
                    {
                        "title": `${watsonData.intents[2].intent.replace('_',' ')}`,
                        "payload": `button_${watsonData.intents[2].intent}`,
                        "content_type": "text"
                    }
                ]
            });
        }
    } else if (.25 > (watsonData.intents[0].confidence - watsonData.intents[1].confidence) && watsonData.output.nodes_visited[0] != 'Em outros casos' && !watsonData.output.flow) {
        console.log(watsonData.intents[1].confidence)
        if (watsonData.output.attachments) {
            watsonData.output.attachments.push({
                "type": "text/quick_reply",
                "value": `Percebi que você quer saber sobre *${watsonData.intents[1].intent.replace('_',' ')}* também.`,
                "quick_replies": [{
                    "title": `${watsonData.intents[1].intent.replace('_',' ')}`,
                    "payload": `button_${watsonData.intents[1].intent}`,
                    "content_type": "text"
                }]
            });
        }
    }
    // ** END ** //

    var action = watsonData.output.action;

    switch (action) {
        case "representative/pending":
            getPendingPayments(messageData, watsonData);
            break;
        case 'calculatePendingPayment':
            calculatePengindPayment(messageData, watsonData);
            break;
        default:
            // Check for quick_reply/buttons answer, otherwise send a normal message.
            // console.log('Watson Data: ', JSON.stringify(watsonData,null, 2));

            if (watsonData.output.attachments != null) {
                buildAttachmentsMessage(messageData, watsonData);
            } else
            if (watsonData.output.quick_replies != null) {
                messageData.message = 'test text nefore video';
                buildQuickReplies(messageData, watsonData, function (messageData) {
                    callSendAPI(messageData);
                });
            } else if (watsonData.output.buttons != null) {
                buildButtonsMessage(messageData, watsonData, function (messageData) {
                    callSendAPI(messageData);
                });
            } else if (watsonData.output.text[0] != null) {
                messageData.message.text = watsonData.output.text[0];
                callSendAPI(messageData);
            }


            break;
    }
}

function buildAttachmentsMessage(messageData, watsonData) {

    var attachments = watsonData.output.attachments;
    console.log('tamanho: ', attachments.length);
    iterateAndSendAttachments(attachments, 0, messageData, function (response) {
        if (response.error == false) {
            console.log('Completed');
            delete watsonData.output.attachments;
            reactToContextAction(messageData, watsonData);
        }
    });


}

function iterateAndSendAttachments(attachments, index, messageData, callback) {
    var msgData = {
        recipient: {
            id: messageData.recipient.id
        }
    }
    console.log('Iterate and send attachments method invoked.. ');
    console.log('index: ', index);

    if (index >= attachments.length) {
        // Break the recursive methods..
        callback({
            error: false
        });
    } else {

        if (attachments[index].type == 'text') {
            msgData['message'] = {
                text: attachments[index].value
            }
            callSendAPI(msgData, function (err) {
                if (err) {
                    console.log('an error occured while sending text message, ', err)
                    setTimeout(() => {
                        iterateAndSendAttachments(attachments, index, msgData, callback);
                    }, 2000);
                } else {
                    console.log('a text message was sent..');
                    iterateAndSendAttachments(attachments, index + 1, msgData, callback);
                }
            });
        } else if (attachments[index].type == 'image' || attachments[index].type == 'video') {
            buildMediaReply(msgData, attachments[index].value, attachments[index].type, function (msgData) {
                callSendAPI(msgData, function (err) {
                    if (err) {
                        console.log('an error occured while sending media message, ', err)
                        setTimeout(() => {
                            iterateAndSendAttachments(attachments, index, msgData, callback);
                        }, 2000);
                    } else {
                        console.log('a media message was sent..');
                        iterateAndSendAttachments(attachments, index + 1, msgData, callback);
                    }
                });

            });
        } else if (attachments[index].type == 'image/quick_reply') {
            buildQuickAttachmentReply(msgData, attachments[index], function (msgData) {
                callSendAPI(msgData, function (err) {
                    if (err) {
                        console.log('an error occured while sending media message, ', err)
                        setTimeout(() => {
                            iterateAndSendAttachments(attachments, index, msgData, callback);
                        }, 2000);
                    } else {
                        console.log('a media message was sent..');
                        iterateAndSendAttachments(attachments, index + 1, msgData, callback);
                    }
                });
            })
        } else if (attachments[index].type == 'text/quick_reply') {
            buildTextQuickReply(msgData, attachments[index], function (msgData) {
                callSendAPI(msgData, function (err) {
                    if (err) {
                        console.log('an error occured while sending text quick reply message, ', err)
                        setTimeout(() => {
                            iterateAndSendAttachments(attachments, index, msgData, callback);
                        }, 2000);
                    } else {
                        console.log('a text quick reply message was sent..');
                        iterateAndSendAttachments(attachments, index + 1, msgData, callback);
                    }
                });
            });
        }

    }

}



function getPendingPayments(messageData, watsonData) {

    console.log('Get pending payments method inoked..');
    var hash = watsonData.context.hash;
    var decrypted = decrypt(hash);

    var options = {
        uri: process.env.PENDING_PAYMENTS_URL,
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            devKey: process.env.devKey,
            acctNr: parseInt(decrypted.split("|")[0].replace(/0/g, "")),
            'X-Sec-Token': decrypted.split("|")[1]
        }
    }

    function callback(error, response, body) {
        if (!error) {
            body = JSON.parse(body);
            savePendingPaymentsOnContext(messageData, body, function (data, err) {
                if (err) {
                    messageData.message.text = "Um erro ocorreu ao validar seu debito pendente. tente mais tarde!";
                    callSendAPI(messageData);
                } else {
                    reactToContextAction(messageData, data);
                }
            });
        } else {
            console.log('error: ', JSON.stringify(response, null, 2));
            messageData.message.text = "Um erro ocorreu ao validar seu debito pendente. tente mais tarde!";
            callSendAPI(messageData);
        }
    }
    request(options, callback);
}



function savePendingPaymentsOnContext(messageData, pendingPayments, callback) {

    messageData.message.text = '.';
    console.log('Received pending payments data from AVON\'s API ', JSON.stringify(pendingPayments, null, 2));
    var options = {
        uri: process.env.NODE_RED_URL,
        method: 'POST',
        json: messageData
    }

    // Como nao temos usuario com debitos pendentes, vamos mockar para simulacao
    var random = Math.floor(Math.random() * 2); // for mock use.
    if (pendingPayments.length == 1 && pendingPayments[0].errCd != null && random == 0) {


        if (pendingPayments[0].errCd == "301" || pendingPayments[0].errCd == "302") {
            // The security token is expired
            // avisa o conversation para falar para o usuario ir no site da avon e entrar pelo link deles.
            messageData.invalidToken = true;

        }


        pendingPayments = null;
        messageData.pendingPayments = pendingPayments;
        request(options, callbackRequest);
    } else {
        // pendingPayments
        // Mock if there is no pendingPayments for test
        if (pendingPayments[0].errCd != null) {

            pendingPayments = []
            require('./pendingPayments')(function (pending) {
                sortPendingPayments(pending, function (sortedPending) {



                    var str = (sortedPending.length > 1) ? "débitos" : "débito";
                    pendingPayments.push({
                        type: "text",
                        value: "Você tem " + sortedPending.length + " " + str + " em aberto: "
                    });
                    sortedPending.forEach(function (payment) {
                        pendingPayments.push({
                            type: "text",
                            value: " Companha: " + payment.cmpgnNr + "/" + payment.cmpgnYr + ".\u000A Valor debito: R$" + payment.amount + "\u000A Linha Digitável do boleto: " + payment.billNr
                        })
                    });


                    messageData.pendingPayments = pendingPayments;

                    console.log(pendingPayments);
                    request(options, callbackRequest);


                });
            })
        } else {
            //Set for api return..

        }
    }

    function callbackRequest(error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('pendingPayments Saved on context');
            callback(body, null);
        } else {
            console.log('Um erro ecorreu!');
            callback(body, true);
        }
    }
}


function sortPendingPayments(pendingPayments, callback) {

    pendingPayments.sort(function (a, b) {
        if (parseInt(a.cmpgnYr) == parseInt(b.cmpgnYr)) {
            return (a.cmpgnNr - b.cmpgnNr);
        } else {
            return parseInt(a.cmpgnYr) - parseInt(b.cmpgnYr);
        }
    })

    callback(pendingPayments);

}

function buildButtonsMessage(messageData, body, callback) {
    messageData.message = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": body.output.text[0] || ' ',
                "buttons": body.output.buttons // Came from conversation!
            }
        }
    }
    callback(messageData);
}


function buildQuickReplies(messageData, body, callback) {
    // console.log(JSON.stringify(body,null,2));
    messageData.message = {
        "text": body.output.text[0] || 'proximo',
        "quick_replies": body.output.quick_replies
    }

    callback(messageData);
}

function buildTextQuickReply(msgData, attachment, callback) {
    msgData.message = {
        "text": attachment.value || 'proximo',
        "quick_replies": attachment.quick_replies
    }
    callback(msgData)
}

function buildQuickAttachmentReply(msgData, attachment, callback) {

    msgData.message = {
        "attachment": {
            "type": attachment.type.split('/')[0],
            "payload": {
                "url": attachment.value
            }
        },
        "quick_replies": attachment.quick_replies
    }

    callback(msgData);


}

function buildMediaReply(messageData, value, type, callback) {
    console.log('Build video message method invoked..');
    var msg = {
        recipient: {
            id: messageData.recipient.id
        }
    }
    msg.message = {
        "attachment": {
            "type": type,
            "payload": {
                "url": value
            }
        }
    }
    console.log(JSON.stringify(msg, null, 2));
    callback(msg);
}



function calculatePengindPayment(messageData, watsonData) {
    console.log('Calculating pending payment method invoked ..');
    // var hash = watsonData.context.hash;
    // var decrypted = decrypt(hash);

    // var options = {
    //     uri: process.env.CALCULATE_PENDING_URL + '?mrktCd=BR&langCd=pt',
    //     method: 'POST',
    //     headers: {
    //         devKey: process.env.devKey,
    //         acctNr: decrypted.split("+")[0],
    //         Authentication: 'Token',
    //         'X-Sec-Token': decrypted.split("+")[1],
    //         'Content-Type': 'application/json'
    //     }
    // }

    buildPaymentCalculatingBody(watsonData.context.pendingPayments, options, function (options) {
        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                body = JSON.parse(body);
                body.newBillNumber = body.newBillNumber.replace(/ /g, '.');
                messageData.calculatedPengindPayment = body;
                sendToConversation(messageData, function (data) {
                    callSendAPI(messageData);
                });

                // messageData.message.text = 'Segue a linha digitável do seu boleto ' + body.newBillNumber.replace(/ /g, '.');

            } else {
                messageData.message.text = "Um erro ocorreu ao validar seu debito pendente. tente mais tarde!"
                callSendAPI(messageData);
            }
        });
    })
}

function sendToConversation(messageData, callback) {

    messageData.message.text = '.';
    var options = {
        uri: process.env.NODE_RED_URL,
        method: 'POST',
        json: messageData
    }

    function callbackRequest(error, response, body) {
        if (!error && response.statusCode == 200) {

            messageData.message.text = body.output.text[0];
            callback(messageData);
        } else {
            console.log('Um erro ecorreu!');
        }
    }
    request(options, callbackRequest);






}

function buildPaymentCalculatingBody(pendingPayments, options, callback) {

    var body = {
        ordNr: pendingPayments.orderNr,
        cmpgnYr: pendingPayments.cmpgYr,
        cmpgnNr: pendingPayments.cmpgnNr,
        pymtSlpBrCdNr: pendingPayments.barCdNr,
        slpNr: pendingPayments.billNr,
        pymtDtFrCalc: moment(pendingPayments.billingDt).format("YYYY-MM-DD"),
        pymtDueDt: moment(pendingPayments.dueDt).format("YYYY-MM-DD"),
        ordOrgAmt: pendingPayments.amount,
        billCnt: "1",
        fineDscntAmt: "0",
        intrstAmt: "90",
        bnkcd: "033-7",
        pymtSlpExpDt: moment(pendingPayments.billXpirtnDt).format("YYYY-MM-DD")
    }
    options.body = JSON.stringify(body);
    callback(options);
}



function callSendAPI(messageData, callback) {
    console.log('Call send api method invoked..')
    console.log(`Facebook user: ${messageData.recipient.id}`);
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
            access_token: process.env.PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;
            console.log("Successfully sent generic message with id %s to recipient %s",
                messageId, recipientId);
            if (callback) {
                callback();
            }
        } else {
            console.error("Unable to send message. ", response.statusCode);
            console.error(body);
            if (callback) {
                callback(error);
            }
        }
    });
}

// Checked 
function saveHashAndRepresentativeOnContext(event) {
    console.log('Saving hash and representative informations.. ');
    var hash = event.referral.hash || event.referral.ref; // get ref instead of hash when hash is not available.
    var messageData = {
        recipient: {
            id: event.sender.id
        },
        message: {
            text: 'oi'
        },
        hash: hash
    };
    // Get representatives and save it with hash to the context.
    getRepresentativeData(messageData, function (representative, err) {

        if (!err) messageData.representative = representative;
        else messageData.invalidToken = true;
        // Save it on conversation's context.

        var options = {
            uri: process.env.NODE_RED_URL,
            method: 'POST',
            json: messageData
        }
        console.log('Saving data on context..');

        function callback(error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('Hash and representative data saved on context..');
                messageData.message.text = body.output.text[0];
                callSendAPI(messageData);
            } else {
                console.log('Um erro ecorreu!');
                messageData.message.text = "Um erro ocorreu ao recuperar seus dados. tente mais tarde!";
                callSendAPI(messageData);
            }
        }
        request(options, callback);
    });
}

// Checked 
function getRepresentativeData(messageData, callback) {
    console.log('Getting representative data method invoked..');
    var hash = messageData.hash;
    var decrypted = decrypt(hash);
    var options = {
        uri: process.env.REPRESENTATIVE_INFORMATION_URL + '?mrktCd=BR&langCd=pt',
        method: 'GET',
        headers: {
            devKey: process.env.devKey,
            acctNr: parseInt(decrypted.split("|")[0].replace(/0/g, "")),
            'Content-Type': 'application/json'
        }
    }

    function callbackRequest(error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('AVON\'s API returned successfully..');
            body = JSON.parse(body);
            callback(body.data.representatives[0], null)
        } else {
            console.log('Error on requesting AVON\'s representative API..');
            // messageData.message.text = "Um erro ocorreu ao recuperar seus dados. tente mais tarde!"
            // callSendAPI(messageData);
            callback(null, true);
        }
    }
    console.log('Making request to AVON\'s API..');
    request(options, callbackRequest);
}



function decrypt(hash) {
    var decrypted;
    // if (key != null) {
    //     hash = hash.replace(new RegExp(" ", "g"), "+") + "=";
    //     decrypted =  key.decrypt(hash, 'base64', 'utf8').replace(new RegExp(" ", "g"), "+");
    // } else {
    //     decrypted =  'username|token'; // if private key passed worng..
    // }
    try {
        // hash = hash.replace(new RegExp(" ", "g"), "+") + "=";
        // decrypted = key.decrypt(hash, 'base64', 'utf8').replace(new RegExp(" ", "g"), "+");
        decrypted = `521|EZVTfPTRA68oo03IlEs4QWGi7JlaCpipZ3SWTELDdg2NH1ZA3n+Ti011NjeIsxb3`;
    } catch (error) {
        console.log('Invlalid hash passed or private key');
        decrypted = 'username|token'; // if private key passed worng..
    }

    return decrypted;
}



app.post('/decrypt', function (req, res) {
    var hash = req.body.hash;
    hash = hash.replace(new RegExp(" ", "g"), "+") + "=";
    res.status(200).json({
        decrypted: key.decrypt(hash, 'base64', 'utf8').replace(new RegExp(" ", "g"), "+")
    });
});



// Listen on the specified port
app.listen(port, function () {
    console.log('Client server listening on port ' + port);
});