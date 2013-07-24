/**
 * Commands implemented by the FTP server
 */
var cmds = module.exports = {};

/**
 * Unsupported commands
 * They're specifically listed here as a roadmap, but any unexisting command will reply with 202 Not supported
 */
cmds.ABOR = function () { this.reply(202) }; // Abort an active file transfer.
cmds.ACCT = function () { this.reply(202) }; // Account information
cmds.ADAT = function () { this.reply(202) }; // Authentication/Security Data (RFC 2228)
cmds.ALLO = function () { this.reply(202) }; // Allocate sufficient disk space to receive a file.
cmds.APPE = function () { this.reply(202) }; // Append.
cmds.AUTH = function () { this.reply(202) }; // Authentication/Security Mechanism (RFC 2228)
cmds.CCC =  function () { this.reply(202) }; // Clear Command Channel (RFC 2228)
cmds.CONF = function () { this.reply(202) }; // Confidentiality Protection Command (RFC 697)
cmds.ENC =  function () { this.reply(202) }; // Privacy Protected Channel (RFC 2228)
cmds.EPRT = function () { this.reply(202) }; // Specifies an extended address and port to which the server should connect. (RFC 2428)
cmds.EPSV = function () { this.reply(202) }; // Enter extended passive mode. (RFC 2428)
cmds.HELP = function () { this.reply(202) }; // Returns usage documentation on a command if specified, else a general help document is returned.
cmds.LANG = function () { this.reply(202) }; // Language Negotiation (RFC 2640)
cmds.LPRT = function () { this.reply(202) }; // Specifies a long address and port to which the server should connect. (RFC 1639)
cmds.LPSV = function () { this.reply(202) }; // Enter long passive mode. (RFC 1639)
cmds.MDTM = function () { this.reply(202) }; // Return the last-modified time of a specified file. (RFC 3659)
cmds.MIC =  function () { this.reply(202) }; // Integrity Protected Command (RFC 2228)
cmds.MKD =  function () { this.reply(202) }; // Make directory.
cmds.MLSD = function () { this.reply(202) }; // Lists the contents of a directory if a directory is named. (RFC 3659)
cmds.MLST = function () { this.reply(202) }; // Provides data about exactly the object named on its command line, and no others. (RFC 3659)
cmds.MODE = function () { this.reply(202) }; // Sets the transfer mode (Stream, Block, or Compressed).
cmds.NOOP = function () { this.reply(202) }; // No operation (dummy packet; used mostly on keepalives).
cmds.OPTS = function () { this.reply(202) }; // Select options for a feature. (RFC 2389)
cmds.REIN = function () { this.reply(202) }; // Re initializes the connection.
cmds.STOU = function () { this.reply(202) }; // Store file uniquely.
cmds.STRU = function () { this.reply(202) }; // Set file transfer structure.
cmds.PBSZ = function () { this.reply(202) }; // Protection Buffer Size (RFC 2228)
cmds.SITE = function () { this.reply(202) }; // Sends site specific commands to remote server.
cmds.SMNT = function () { this.reply(202) }; // Mount file structure.
cmds.RMD =  function () { this.reply(202) }; // Remove a directory.
cmds.STAT = function () { this.reply(202) }; //


/**
 * General info
 */
cmds.FEAT = function () {
    this.write('211-Extensions supported\r\n');
    // No feature
    this.reply(211, 'End');
};
cmds.SYST = function () {
    this.reply(215, 'Node FTP featureless server')
};

/**
 * Path commands
 */
cmds.CDUP = function () { // Change to parent directory
    cmds.CWD.call(this, '..')
};

cmds.CWD = function (dir) { // Change working directory
    var socket = this;
    socket.fs.chdir(dir, function (cwd) {
        socket.reply(250, 'Directory changed to "' + cwd + '"');
    })
};

cmds.PWD = function () { // Get working directory
    this.reply(257, '"' + this.fs.pwd() + '"');
};
cmds.XPWD = cmds.PWD; // Alias to PWD

/**
 * Change data encoding
 */
cmds.TYPE = function (dataEncoding) {
    if (dataEncoding == "A" || dataEncoding == "I") {
        this.dataEncoding = (dataEncoding == "A") ? this.asciiEncoding : "binary";
        this.reply(200)
    } else {
        this.reply(501)
    }
};

/**
 * Authentication
 */
cmds.USER = function (username) {
    // by default there is no authentication. Override this function to provide that.
    this.user.username = username;
    this.reply(331);
};

cmds.PASS = function (password) {
    /* You must override this command to implement your own authentication rules */
    if (!this.user.username) {
        // Bad sequence of command responses and triggering rules need to be abstracted out.
        this.reply(503, "You must provide a user name before password."); // Bad sequence of commands.
    } else {
        if (this.user.username == 'anonymous') {
            this.user.authorized = true; // we only require a user name in this implementation (i.e. anonymous login)
            this.reply(230); // user logged in message
        } else {
            this.reply(530); // user not logged in
        }
    }
};
/**
 * Passive mode
 */
cmds.PASV = function () { // Enter passive mode
    var socket = this;

    socket.createPassiveServer(function (dataServer) {
        dataServer.on('connection', function (dataSocket) {
                dataSocket.setEncoding(socket.dataEncoding);
                // Unqueue method that has been queued previously
                if (socket.dataTransfer.queue.length) {
                    socket.dataTransfer.queue.shift().call(dataSocket)
                } else {
                    dataSocket.emit('error', {code: "421"});
                    socket.end();
                }

                dataSocket.on('close', function () {
                    socket.reply(this.error ? 426 : 226);
                    dataServer.close();
                });

                dataSocket.on('error', function (err) {
                    this.error = err;
                    socket.reply(err.code || 500, err.message)
                });
            }
        );

        socket.passive.enabled = true;
        var host = dataServer.address().address,
            port = dataServer.address().port;

        socket.reply(227, 'PASV OK (' + host.split('.').join(',') + ',' + parseInt(port / 256, 10) + ',' + (port % 256) + ')')
    })
};
/**
 * The PORT command is sent by the client to tell the server what address and port on the client
 * to send files to. The format is 4 bytes for the ip address and two bytes for port, which are
 * passed as a comma separated string of integers. This command establishes an active connection.
 */
cmds.PORT = function (ip1, ip2, ip3, ip4, port1, port2) {
    this.passive.enabled = false; // PORT command means we are switching to active mode.
    this.active.host = [ip1, ip2, ip3, ip4].join().replace(/,/g, '.');
    this.active.port = parseInt((parseInt(port1) * 256) + parseInt(port2));
    this.reply(200, "PORT command successful");
};
/**
 * Filesystem
 */
cmds.LIST = function (target) {
    var socket = this;
    socket.dataTransfer(function (dataSocket, finish) {
        socket.fs.list(target || socket.fs.pwd(), function (result) {
            dataSocket.write(result + '\r\n', finish);
        });
    });
};
cmds.NLST = function (target) {
    // TODO: just the list of file names
    this.reply(202);
};
cmds.RETR = function (file) {
    var socket = this;
    socket.dataTransfer(function (dataSocket, finish) {
        socket.fs.readFile(file, function (stream) {
            stream.on('data', function (chunk) {
                dataSocket.write(chunk, socket.dataEncoding);
            });
            stream.on('end', function () {
                dataSocket.end();
            });
        });
    });
};
cmds.STOR = function (file) {
    var socket = this;
    socket.dataTransfer(function (dataSocket, finish) {
        socket.fs.writeFile(file, function (stream) {
            dataSocket.on('data', function (chunk) {
                stream.write(chunk, socket.dataEncoding);
            });
            dataSocket.on('end', function () {
                stream.end()
            });
        });
    });
};
cmds.DELE = function (file) {
    var socket = this;
    socket.fs.unlink(file, function () {
        socket.reply(250)
    })
};
cmds.RNFR = function (name) {
    this.reply(202);
    // Rename from.
    /*socket.filefrom = socket.fs.cwd() + command[1].trim();
     socket.send("350 File exists, ready for destination name.\r\n");*/
};
cmds.RNTO = function (name) {
    this.reply(202);
    // Rename to.
    /*var fileto = socket.fs.cwd() + command[1].trim();
     rn = sys.exec("mv " + socket.filefrom + " " + fileto);
     rn.addCallback(function (stdout, stderr) {
     socket.send("250 file renamed successfully\r\n");
     });
     rn.addErrback(function () {
     socket.send("250 file renamed successfully\r\n");
     });*/
};
/**
 * Allow restart interrupted transfer
 */
cmds.REST = function (start) {
    this.reply(202);
    // Restart transfer from the specified point.
    /*socket.totsize = parseInt(command[1].trim());
     socket.send("350 Rest supported. Restarting at " + socket.totsize + "\r\n");*/
};
/**
 * Disconnection
 */
cmds.QUIT = function () {
    this.reply(221);
    this.end();
};