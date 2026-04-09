const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('C:\\Users\\mif75987\\.gemini\\antigravity\\brain\\3968d7cf-4e61-4354-9ca5-3b4094467ce1\\.tempmediaStorage\\68787cc7ccb0c430.pdf');

pdf(dataBuffer).then(function(data) {
    console.log(data.text);
}).catch(function(error) {
    console.error(error);
});
