var jsf = require('json-schema-faker');


var schema = {

    "type": "array",
    "minItems": 1,
    "maxItems": 5,
    "items": {
        "type": "object",
        "properties": {
            cmpgnYr: {
                type: 'string',
                faker: {
                    "custom.year_between": ['2015', '2018']
                }
            },
            cmpgnNr:  {
                type: 'integer',
                minimum: 1,
                maximum: 30,
                exclusiveMaximum: true,
                exclusiveMinimum: true
            },
            amount: {
                type: "number",
                faker: {
                    "finance.amount": [100, 1000, 2]
                }
            },
            billNr:{
                type: "string",
                faker: "custom.billNr"
            }
        },
        required: ['cmpgnYr','cmpgnNr','amount','billNr']
    }

}

jsf.extend('faker', function () {
    var faker = require('faker');

    faker.custom = {
        year_between: function (from, to) {
            return faker.date.between(from, to).toString().split(' ')[3]
        },
        billNr: function(){
            return generateNumber(5)+"."+generateNumber(5)+"."+generateNumber(5)+"."+generateNumber(6)+"."+generateNumber(5)+'.'+generateNumber(6)+"."+generateNumber(1)+'.'+generateNumber(14);
        }
    }


    return faker;
});


function generateNumber(length){
    return  Math.floor( Math.random() * (  Math.pow(10,length) - 1 - Math.pow(10,length - 1)  ) ) + Math.pow(10,length - 1);
}



var getMockResponse = (callback) => {
    jsf.resolve(schema).then(function(result) {
        callback(result);
    });
}
module.exports = getMockResponse