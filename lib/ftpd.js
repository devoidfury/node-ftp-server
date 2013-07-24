var path = require('path'),
    net = require('net'),
    server = module.exports = exports = net.createServer(),
    messages = exports.messages = require('./messages.js'),
    commands = exports.commands = require('./commands.js');

/**
 * FS emulator
 */
var fsWrapper = require('./fs');
server.fsOptions = {};

/**
 * Patch server.close: server.closing is checked in the 'data' listener
 * to disallow any more commands while closing.
 */
server.closing = false;
var original_server_close = server.close;
server.close = function () {
    this.closing = true;
    original_server_close.call(this)
};

/**
 * Listener on the server receives a new client socket
 */
server.on('connection', function (socket) {
    /**
     * Configure client connection info
     */
    socket.setTimeout(0);
    socket.setNoDelay();
    socket.dataEncoding = "binary";
    socket.asciiEncoding = "utf8";
    socket.user = {
        'authorized': false,
        'username': null,
        'home': server.fsOptions.root
    };
    socket.passive = {
        // this address is set with PORT and PASV command sequence.
        "enabled": false,
        "host": socket.localAddress,
        "min_port": null, // defaults are the IANA registered ephemeral port range (49152 - 65534).
        'max_port': null
    };
    socket.active = {
        "host": socket.localAddress,
        "port": socket.localPort - 1 // L-1: if control port is default 21, then active data port will be 20
    };

    /**
     * Initialize filesystem
     */
    socket.fs = new fsWrapper.Filesystem(server.fsOptions);
    // Catch-all
    socket.fs.onError = function (err) {
        if (!err.code) err.code = 550;
        socket.reply(err.code, err.message)
    };

    /**
     * Method for creating a server for passive ftp data transport.
     *
     * It will select a random port within a specified min-max range of ports.
     * Typically this will be invoked by the PASV command implementation.
     */
    socket.createPassiveServer = function (cb) {
        /*
         * Returns a random integer between min and max
         * Using Math.round() will give you a non-uniform distribution!
         */
        var min = socket.passive.min_port || 49152; // defaults are the IANA registered ephemeral port range.
        var max = socket.passive.max_port || 65534;
        var port = Math.floor(Math.random() * (max - min + 1)) + min;
        var server = net.createServer();
        server.listen(port, function () {
            cb(this)
        });

        // We can't bind to this port, so we will keep trying until we get a live one!
        server.on('error', function (err) {
            socket.createPassiveServer(cb)
        });
    };

    /**
     * Socket response shortcut
     */
    socket.server = server;
    socket.reply = function (status, message, callback) {
        if (!message) message = messages[status.toString()] || 'No information';
        if (this.writable) {
            this.write(status.toString() + ' ' + message.toString() + '\r\n', callback)
        }
    };

    /**
     * Data transfer
     */
    socket.dataTransfer = function (handle) {
        function finish(dataSocket) {
            return function (err) {
                if (err) {
                    dataSocket.emit('error', err);
                } else {
                    dataSocket.end();
                }
            }
        }

        function execute() {
            socket.reply(150);
            handle.call(socket, this, finish(this))
        }

        // Will be unqueued in PASV command
        if (socket.passive.enabled) {
            socket.dataTransfer.queue.push(execute)
        }
        // Or we initialize directly the connection to the client
        else {
            net.createConnection(socket.active.port, socket.active.host).on('connect', execute)
        }
    };
    socket.dataTransfer.queue = [];

    /**
     * Received a command from socket
     */
    socket.on('data', function (chunk) {

        // If server is closing, refuse all commands
        if (server.closing) {
            socket.reply(421)
        }

        // Parse received command and reply accordingly
        var parts = trim(chunk.toString()).split(" "),
            command = trim(parts[0]).toUpperCase(),
            args = parts.slice(1, parts.length),
            callable = commands[command];

        if (!callable) {
            socket.reply(502)
        } else if (command != 'USER' && command != 'PASS' && socket.user.authorized == false) {
            socket.reply(530)
        } else {
            callable.apply(socket, args)
        }
    });

    // We have a new connection so acknowledge this to the FTP client
    socket.reply(220)
});

function trim(string) {
    return string.replace(/^\s+|\s+$/g, "")
}

if (!module.parent) {
    server.fsOptions.root = path.resolve(__dirname, '..', 'test', 'data');
    server.listen(21)
}
