var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var request = require('request');

var PAGE_ACCESS_TOKEN = 'EAAHKrOfcyjkBAPENMxGEWySm1XwQoFXgGWRVUpQsrxPvbXXxm1eRZAIYKGPwEaaqnZCZCSnPswbmgQXReRUcenqvcKqVwZAylUrHPJRZA7AX7ZCNryeVKTYM2H6ZB0FBbFtdJv2TiND4f1g4ZBbDbPA6zuFV5hAOGPZCFvYI3uUZB8MgZDZD';
var NODE_RED_URL = 'https://demos-node-red.mybluemix.net/avonConversation';

app.use(bodyParser.json());

var port = process.env.PORT || 5000;
app.set('port', port);


app.get('/facebook/receive', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' &&
        req.query['hub.verify_token'] === 'avon_rzeined_token') {
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
            entry.messaging.forEach(function (event) {
                if (event.message) {
                    receivedMessage(event);
                } else {
                    console.log("Webhook received unknown event: ", event);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know
        // you've successfully received the callback. Otherwise, the request
        // will time out and we will keep trying to resend.
        res.sendStatus(200);
    }
});

function receivedMessage(event) {
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:",
        senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var messageId = message.mid;

    var messageText = message.text;
    var messageAttachments = message.attachments;

    if (messageText) {
                sendTextMessage(senderID, messageText);
    } else if (messageAttachments) {
        sendTextMessage(senderID, "Message with attachment received");
    }
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
        uri: NODE_RED_URL,
        method: 'POST',
        json: messageData
    }

    function callback(error, response, body){

        if(!error && response.statusCode == 200){
            messageData.message.text = 'Retornou';
        }else{
            messageData.message.text = 'Erro ocorreu';
        }
        callSendAPI(messageData);
    }
    request(options, callback);


    
}


function callSendAPI(messageData) {
    request({
        uri: 'https://graph.facebook.com/v2.6/me/messages',
        qs: { access_token: PAGE_ACCESS_TOKEN },
        method: 'POST',
        json: messageData

    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var recipientId = body.recipient_id;
            var messageId = body.message_id;

            console.log("Successfully sent generic message with id %s to recipient %s",
                messageId, recipientId);
        } else {
            console.error("Unable to send message.");
            console.error(response);
            console.error(error);
        }
    });
}



// Listen on the specified port
app.listen(port, function () {
    console.log('Client server listening on port ' + port);
});
