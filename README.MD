# AVON's FACEBOOK CHATBOT BACKEND

> This is for test

To access the facebook bot messenger you have to write the link
below
```
    https://www.messenger.com/t/<Page_id>?ref=<HASH>
```

| Attribute | Value |
| --- | --- |
Page_id | Your facebook page id. ex: 270627923401307 |
| HASH | generated RSA HASH via AVON website |


## Generate HASH for test

1. **Generate Token via AVON's API**

AVON's offered 2 users for test.

```
    user1: 520
    user2: 521

```

### How to get the token ? 

Making request to AVON's API, with required attributes. 

```
    METHOD: POST https://la.agws3.avon.com/ags-auth-web/rest/v1/BR/pt/login
 
```

The body content 
```
    {
     "userId": "521",
     "password": "123abc",
     "userType": "rep",
     "domain": "AVONSA"
    }
```

and the request header must have two attributes 

```
    Content-Type: "Content-Type"
    devKey : X5IrjRRjsGzrBvMh5x+vlOBpUGJIRvJl
```

The response for this request might be 

```
    {
    "mrktCd": "BR",
    "userId": "521",
    "token": "EZVTfPTRA68oo03IlEs4QWGi7JlaCpipknC6aIdJMgY2Ubq1pRD/TwqAk9gL7cdK"
    }
```

We got the token. Now we have to generate the hash.

2. Generate hash from valid token

Once you have a valid token with valid user. we can generate a valid HASH using another application. 
What we need to do is a simple request.

```
    METHOD: GET  https://hashgenerator.mybluemix.net/encrypt?key=<userid>|<Token>
```

| Attribute | Value |
| --- | --- |
| userid | AVON's user id. ex: 521|
| Token | Valid generated token in step 1. ex: EZVTfPTRA68oo03IlEs4QWGi7JlaCpipknC6aIdJMgY2Ubq1pRD/TwqAk9gL7cdK

> Don't forgot the pipe character between userid and token:  userid **|** token without any space

the request response will be like

```
    {
       "encrypted": "D+W4HlZ17cxgvc5bzxZOJAjcoPaFlw2MIt4RZq4ADar9oUp78tPPCbX0jixIWKGYWO3JA4ZMhuz6KE0oIDbc3Wr2MJUQedUaHt8f9oEm1Ymk3laP5JtwWWC8c0dkouZulNxgCYofquu9p0YCN/FlY5ZZLSEaxoEqV/x+K0xJzukP4dD5t3ekibbT+64M3Srp2aBrHC62Ek8WT1yRNalxi3TD8BK9+BmiZLaOnKVkneQAlduEdRV5dlEPvOHpxWU85OeWAvHLey5LDfz55qDnI2OoMlcLJSCiA60zOcMPU5sYByBAJ72MmrimBVLZJQQop6mrOXx+Ge/Pi0tf72cTCQ=="
    }
```

Now you got a valid HASH. you can use it to access the facebook bot and test the app.