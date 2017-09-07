var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var request = require('request');
var moment = require('moment');
app.use(bodyParser.json());
var port = process.env.PORT || 5000;
app.set('port', port);

var fs = require('fs')
, ursa = require('ursa');
key = ursa.createPrivateKey(fs.readFileSync('./key.pem'));

require('dotenv').load(); // Load .env file to process.. 



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
                        receivedMessage(event);
                    } else if (event.referral) {
                        // Get Hash params using facebook messenger link..
                        saveHashOnContext(event);
                    } else {
                        console.log("Webhook received unknown event: ");
                    }
                });
            } else if (entry.standby) {
                entry.standby.forEach(function (event) {
                    if (event.postback) {
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

function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);

    var messageId = message.mid;
    var messageText = message.text;

    sendTextMessage(senderID, messageText);
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
    // var action = watsonData.context.action;
    var action = getAction(watsonData); // Fake for test 
    switch (action) {
        case "representative/pending":
            getRepresentativePending(messageData, watsonData);
            break;
        case 'calculatePendingPayment':
            calculatePengindPayment(messageData, watsonData);
            break;
        default:
            messageData.message.text = watsonData.output.text[0];
            callSendAPI(messageData);
            break;
    }
}

// Mock actions..
function getAction(watsonData) {
    switch (watsonData.input.text) {
        case 'debitos pendentes':
            return 'representative/pending';
            break;
        case 'Sim':
            return 'calculatePendingPayment'
            break;
        default:
            return 'normal';
            break;
    }
}

function getRepresentativePending(messageData, watsonData) {

    var hash = watsonData.context.hash;
    var decrypted = decrypt(hash);
    var options = {
        uri: process.env.REPRESENTATIVE_INFORMATION_URL + '?mrktCd=BR&langCd=pt',
        method: 'GET',
        headers: {
            devKey: process.env.devKey,
            acctNr: decrypted.split("+")[0],
            Authentication: 'Token',
            'X-Sec-Token': decrypted.split("+")[1]
        }
    }

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);
            saveRepresentativesOnContext(messageData, body.data.representatives[0]);
            getPendingPayments(messageData, watsonData, body.data.representatives[0].profilePersonal.firstName);
        } else {
            messageData.message.text = "Um erro ocorreu ao validar seu debito pendente. tente mais tarde!"
            callSendAPI(messageData);
        }
    }
    request(options, callback);
}


function getPendingPayments(messageData, watsonData, userFirstName) {

    console.log('Get pending payments method inoked..');
    var hash = watsonData.context.hash;
    var decrypted = decrypt(hash);

    var options = {
        uri: process.env.PENDING_PAYMENTS_URL + '?mrktCd=BR&langCd=pt',
        method: 'GET',
        headers: {
            devKey: process.env.devKey,
            acctNr: decrypted.split("+")[0],
            Authentication: 'Token',
            impersAccNr: 'UNKNOWN',
            'X-Sec-Token': decrypted.split("+")[1]
        }
    }
    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            body = JSON.parse(body);

            savePendingPaymentsOnContext(messageData, body);
            buildButtonsMessage(messageData, body, userFirstName, function (messageData) {
                callSendAPI(messageData);
            });

        } else {
            messageData.message.text = "Um erro ocorreu ao validar seu debito pendente. tente mais tarde!"
            callSendAPI(messageData);
        }
    }
    request(options, callback);
}

function buildButtonsMessage(messageData, body, userFirstName, callback) {

    messageData.message = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": userFirstName + ', você tem R$' + (body.amountPOff - body.amount) + ' em aberto, deseja que eu gere um novo boleto?',
                "buttons": [
                    {
                        "type": "postback",
                        "title": "Sim",
                        "payload": "GENERATE_BOLETO"
                    },
                    {
                        "type": "postback",
                        "title": "Nao",
                        "payload": "DONT_GENERATE"
                    }
                ]
            }
        }
    }
    callback(messageData);
}


function calculatePengindPayment(messageData, watsonData) {

    var hash = watsonData.context.hash;
    var decrypted = decrypt(hash);

    var options = {
        uri: process.env.CALCULATE_PENDING_URL + '?mrktCd=BR&langCd=pt',
        method: 'POST',
        headers: {
            devKey: process.env.devKey,
            acctNr: decrypted.split("+")[0],
            Authentication: 'Token',
            'X-Sec-Token': decrypted.split("+")[1],
            'Content-Type': 'application/json'
        }
    }

    buildPaymentCalculatingBody(watson.pendingPayments, options, function (options) {
        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                body = JSON.parse(body);
                messageData.message.text = 'calculando..';
                callSendAPI(messageData);
            } else {
                messageData.message.text = "Um erro ocorreu ao validar seu debito pendente. tente mais tarde!"
                callSendAPI(messageData);
            }
        });
    })
}

function buildPaymentCalculatingBody(pendingPayments, options, callback) {

    var body = {
        ordNr: pendingPayments.orderNr,
        cmpgnYr: pendingPayments.cmpgYr,
        cmpgnNr: pendingPayments.cmpgnNr,
        pymtSlpBrCdNr: pendingPayments.barCdNr,
        slpNr: pendingPayments.billNr,
        pymtDtFrCalc: moment.unix(pendingPayments.billingDt).format("YYYY-MM-DD"),
        pymtDueDt: moment.unix(pendingPayments.dueDt).format("YYYY-MM-DD"),
        ordOrgAmt: pendingPayments.amount,
        billCnt: "1",
        fineDscntAmt: "0",
        intrstAmt: "90",
        bnkcd: "033-7",
        pymtSlpExpDt: moment.unix(pendingPayments.billXpirtnDt).format("YYYY-MM-DD")
    }
    options.body = body;
    callback(options);
}



function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;
            console.log("Successfully sent generic message with id %s to recipient %s",
                messageId, recipientId);
        } else {
            console.error("Unable to send message. ", response.statusCode);
            // console.error(response);
            console.error(error);
        }
    });
}


function saveHashOnContext(event) {

    // Do the decypt function , copy it from old code.. 
    var hash = event.referral.ref;

    // Save it on context. 
    var recipientId = event.sender.id;
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: ' '
        },
        hash: hash
    };

    var options = {
        uri: process.env.NODE_RED_URL,
        method: 'POST',
        json: messageData
    }

    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('Hash Saved on context');
        } else {
            console.log('Um erro ecorreu!');
        }
    }
    request(options, callback);
}

function saveRepresentativesOnContext(messageData, representatives) {
    // Save it on context. 
    messageData.representatives = representatives;
    var options = {
        uri: process.env.NODE_RED_URL,
        method: 'POST',
        json: messageData
    }
    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('representatives Saved on context');
        } else {
            console.log('Um erro ecorreu!');
        }
    }
    request(options, callback);
}

function savePendingPaymentsOnContext(messageData, pendingPayments) {
    messageData.pendingPayments = pendingPayments;
    var options = {
        uri: process.env.NODE_RED_URL,
        method: 'POST',
        json: messageData
    }
    function callback(error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log('pendingPayments Saved on context');
        } else {
            console.log('Um erro ecorreu!');
        }
    }
    request(options, callback);
}

function decrypt(hash) {
    // Find the correct way
    return key.decrypt(hash, 'base64', 'utf8');
}
// Listen on the specified port
app.listen(port, function () {
    console.log('Client server listening on port ' + port);
});
