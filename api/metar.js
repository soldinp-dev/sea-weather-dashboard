'use strict';

const https = require('https');

exports.handler = async (event) => {
    const url = 'https://api.weather.com/v1/metar';

    return new Promise((resolve, reject) => {
        https.get(url, (resp) => {
            let data = '';

            // A chunk of data has been received.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                resolve({ statusCode: 200, body: data });
            });

        }).on('error', (err) => {
            reject({ statusCode: 500, body: err.message });
        });
    });
};
