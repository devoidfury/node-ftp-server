var ftp = require('./ftpd');

if (require.main === module) {
    var path = require('path');

    ftp.createServer({
        backend: {
            root: path.resolve(__dirname, '..', 'test', 'data')
        }
    }).listen(21)

} else {
    module.exports = ftp;
}
