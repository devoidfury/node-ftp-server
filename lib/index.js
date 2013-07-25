var ftp = require('./ftpd');

if (require.main === module) {
    var s = ftp.createServer(),
        path = require('path');

    s.fsOptions.root = path.resolve(__dirname, '..', 'test', 'data');
    s.listen(21)

} else {
    module.exports = ftp;
}


