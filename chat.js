/*jslint regexp: true */
(function () {
    'use strict';

    /*
     * WGlads.com | Powerfull light-weight chat system ^___^
     * Copyright (c) Yuri Borunov, 2015
     */

    var fs          = require('fs'),
        io          = require('socket.io'),
        wrap        = require('wordwrap'),
        memcache    = require('memcache'),
        redis       = require('redis'),

        notify      = require('./notification.js'),

        chatSockets,
        mclient,
        mclient_reconnect_id,
        rclient,

        secret_key = 'abcd',
        users = {},
        users_id = {},
        users_gags = {},

        libs = require('./libs.js')(mclient, users_gags),

        sendMessage;

    fs.writeFile(__dirname + "/chat.pid", process.pid, function (err) {

        if (err) {
            console.log(err);
        } else {
            console.log('The chat process pid was saved!');
        }
    });

    // Run Socket.IO to listen on specific port
    io.listen(9045, {'log level': 1});

    // Selects all connection to specific channel
    chatSockets = io.of('/chat');

    notify.roomsModuleInit(chatSockets);

    // Connect to Memcache
    mclient = new memcache.Client(11312,  'localhost');
    mclient.connect();

    // Connect to Redis
    rclient = redis.createClient(6379, 'localhost');
    rclient.on('connect', function () {

        // Listen system messages 30 seconds after start
        setTimeout(function () {
            rclient.subscribe('chat_system');
            rclient.subscribe('sys_cmd');
        }, 1000 * 30);
    });

    // Socket IO events
    chatSockets.on('connection', function (socket) {

        // Accept new connection
        socket.emit('auth', { hello: 'Welcome to WGlads brand-new chat' });

        // Accept authorization data from client    
        socket.on('save_auth', function (data) {

            var user_md5,
                got_key,
                comms,
                comms_arr,
                commn_key,
                count_users,
                i;

            console.log("Accept authorization data from client");

            if (!data.login || !data.auth_key) {

                console.log("Client sent wrong authorization data");

                return false;
            }

            // create MD5 to verify secret_key        
            user_md5 = libs.make_md5(libs.convert_tocp1251(data.login));
            got_key = libs.make_md5(secret_key + user_md5);

            if (got_key !== data.auth_key) {

                console.log("login: " + data.login + " = wrong md5");

                socket.emit('error', { text: 'wrong auth key' });

                return false;
            }

            // add user to system
            users[data.login] = socket.id;
            users_id[data.uid] = data.login;

            // save extra data to socket
            socket.uid = data.uid;
            socket.login = data.login;
            socket.level = data.level;
            socket.locate = data.locate;
            socket.color = data.color;

            socket.join('global');
            socket.join('loc_' + data.locate);

            notify.addUser(data.uid, data.login, socket.id);

            if (data.clan) {

                socket.join('clan_' + data.clan);

                if (data.clan === 'Magistratus') {

                    socket.join('clan_Senate');
                }
            }

            if (data.communities !== 'underfined' && data.communities !== '') {

                comms = data.communities.split(",");
                comms_arr = [];

                for (i = 0; i <= comms.length - 1; i += 1) {

                    commn_key = libs.make_md5(comms[i]);

                    socket.join('comms_' + commn_key);
                    console.log('join comm: "' + comms[i] + '", comms_' + commn_key);
                    comms_arr[comms_arr.length] = 'comms_' + commn_key;
                }

                socket.communities = comms_arr;

            } else {

                socket.communities = [];
            }

            count_users = users.length;

            console.log('It\'s ' + count_users + ' users online for now');
        });

        // Accept authorization data from client    
        socket.on('switch_location', function (data) {

            if (!socket.login) {
                return;
            }

            console.log('User ' + socket.login + ' wish to switch location: ' + data.location);

            socket.leave('loc_' + socket.locate);
            socket.join('loc_' + data.location);

            socket.locate = data.location;

            //console.log(chatSockets.manager.roomClients[socket.id]);
        });

        // Accept authorization data from client    
        socket.on('save_communities', function (data) {

            var i,
                comms,
                comms_new,
                comms_arr,
                commn_key;

            if (!socket.login) {
                return;
            }

            console.log('User ' + socket.login + ' save communities: ' + data.communities);

            comms = socket.communities;

            for (i = 0; i <= comms.length - 1; i += 1) {

                socket.leave(comms[i]);
            }

            comms_new = data.communities.split(",");
            comms_arr = [];

            for (i = 0; i <= comms_new.length - 1; i += 1) {

                commn_key = libs.make_md5(comms_new[i]);

                socket.join('comms_' + commn_key);

                comms_arr[comms_arr.length] = 'comms_' + commn_key;
            }

            socket.communities = comms_arr;
        });

        // Accept authorization data from client    
        socket.on('save_level', function (data) {

            if (!socket.login) {
                return;
            }

            console.log('User ' + socket.login + ' save level: ' + data.level);

            socket.level = data.level;
        });

        // Accept new messages
        socket.on('add_msg', function (data) {

            var ts,
                txt,
                text,
                words,
                pattern,
                pattern_txt,
                logins_constr,
                private_login,
                communities,
                comm_name,
                commn_key,
                clan_row,
                i;

            if (!socket.login) {
                return;
            }

            // check if user got gag in mouth
            ts = Math.round((new Date()).getTime() / 1000);

            if (users_gags[socket.uid] && (users_gags[socket.uid] === 0 || users_gags[socket.uid] > ts)) {

                txt = 'You have been blocked in chat, you will be able to chat only after ' + Math.ceil((users_gags[socket.uid] - ts) / 60) + ' min.';

                sendMessage({
                    type: 'private',
                    to: socket.login,
                    from: 'Senator Gracchus',
                    text: 'private (' + socket.login + ') ' + txt,
                    color: 'black'
                });

                return true;
            }

            console.log('Accepted new message from user ' + socket.login);

            text = data.text;

            // filtering accepted message
            text = text.replace(/^\s+|\s+$/g, ''); // trim
            text = libs.escapeHtml(text); // remove html

            // wrap big strings
            words = text.split(' ');

            for (i = 0; i <= words.length - 1; i += 1) {
                words[i] = wrap.hard(70)(words[i]).split('\n').join(' ');
            }

            text = words.join(' ');

            // replace internal links with text
            text = text.replace(/http:\/\/wglads\.(com|ru)\/game\/[\-a-zA-Z0-9_\.?=\/&]+/i, '(prohibited link)');

            // check if the message is advertising
            pattern_txt = text.replace(/[^a-zA-Z]/i, "");

            if (pattern_txt.match(/(gladiatorsru|fdworldsnet|vk\.com\/app)/i)) {

                txt = 'This is prohibited link, don\'t add it to chat, please :thanks:';

                sendMessage({
                    type: 'private',
                    to: socket.login,
                    from: 'Senator Gracchus',
                    text: 'private (' + socket.login + ') ' + txt,
                    color: 'black'
                });

                return true;
            }

            // if user's level less than 20 and he's writing in private chat
            if (socket.level < 20 && (text.indexOf('private (') >= 0 || text.indexOf('communmity (') >= 0 || text.match(/clan \([a-zA-Z]+\)/i))) {

                txt = 'it\'s too sad, however until 20 level you allowed to chat exclusively in common chat. We all once were in the same circumstances :zdarov: ';

                sendMessage({
                    type: 'private',
                    to: socket.login,
                    from: 'Senator Gracchus',
                    text: 'private (' + socket.login + ') ' + txt,
                    color: 'black'
                });

                return true;
            }

            // if message contains private notation
            if (text.indexOf('private (') >= 0) {

                pattern = /private \(([\-a-zA-Zа-яА-Я0-9_\s]+)\)/g;

                logins_constr = text.match(pattern);

                console.log('- sending to private section');

                if (logins_constr !== null) {

                    for (i = 0; i < logins_constr.length; i += 1) {

                        private_login = logins_constr[i].replace(pattern, "$1");

                        if (private_login !== socket.login) {

                            //console.log('login - '+private_login);
                            sendMessage({
                                type: 'private',
                                to: private_login,
                                from: socket.login,
                                text: text,
                                color: socket.color,
                                is_hidden: data.is_hidden
                            });
                        }
                    }
                    sendMessage({
                        type: 'private',
                        to: socket.login,
                        from: socket.login,
                        text: text,
                        color: socket.color,
                        is_hidden: data.is_hidden
                    });
                    return true;
                }
                return false;
            }

            // if message contain community address
            if (text.indexOf('community (') >= 0) {

                pattern = /community \(([\-a-zA-Zа-яА-Я\s\.]+)\)/g;

                communities = text.match(pattern);

                console.log('- sending to community section');

                if (communities !== null) {

                    if (communities.length > 0) {

                        comm_name = communities[0].replace(pattern, "$1");
                        commn_key = libs.make_md5(comm_name);

                        sendMessage({
                            type: 'community',
                            to: 'comms_' + commn_key,
                            from: socket.login,
                            text: text,
                            color: socket.color,
                            is_hidden: data.is_hidden
                        });
                    }

                    return true;
                }

                return false;
            }

            // if message contain clan issue
            if (text.indexOf('clan (') >= 0) {

                console.log('clan section');

                pattern = /clan \(([a-zA-Z]+)\)/i;
                clan_row = pattern.exec(text);

                //console.log(clan_row);
                if (clan_row !== null) {

                    sendMessage({
                        type: 'clan',
                        to: 'clan_' + clan_row[1],
                        from: socket.login,
                        text: text,
                        color: socket.color,
                        is_hidden: socket.is_hidden
                    });

                    return true;
                }

                return false;
            }

            // if a message to a global chat
            if (data.channel === 'global') {

                sendMessage({
                    type: 'global',
                    to: 'global',
                    from: socket.login,
                    text: text,
                    color: socket.color,
                    is_hidden: data.is_hidden
                });

                return true;
            }

            // if just a regular message to current location chat
            sendMessage({
                type: 'locate',
                to: 'loc_' + socket.locate,
                from: socket.login,
                text: text,
                color: socket.color,
                is_hidden: data.is_hidden
            });
        });

        socket.on('disconnect', function () {

            console.log('user ' + socket.login + ' disconnected :(');

            notify.delUser(socket.uid);
            //uid_todel[socket.uid] = Math.round((new Date()).getTime() / 1000); 
            //console.log(chatSockets.clients())
            //delete users[socket.login];
            //delete users_id[socket.uid];
        });
    });

    sendMessage = function (data) {

        var now = new Date(),
            hours = (now.getHours() < 10) ? '0' + now.getHours() : now.getHours(),
            minutes = (now.getMinutes() < 10) ? '0' + now.getMinutes() : now.getMinutes(),
            time = hours + ':' + minutes, //+':'+now.getSeconds()
            from = data.from,
            to = data.to,
            text = data.text,
            color = data.color,
            type = data.type,
            is_hidden = data.is_hidden,
            ready_data;

        if (is_hidden === '1') {

            from = 'unkown';
        }

        ready_data = {
            'type': type,
            'time': time,
            'login': from,
            'text': text,
            'color': color
        };

        if (type === 'global' || type === 'locate' || type === 'clan' || type === 'community') {

            console.log('send to: ' + type + ' - ' + data.to);

            chatSockets.in(data.to).emit('message', ready_data);

            return true;
        }

        if (type === 'private' || type === 'system') {

            //console.log(users);
            //console.log('to'+data.to);
            //console.log('user '+users[data.to]);

            if (!users[to]) {
                return;
            }

            console.log('send to: private - ' + to);

            chatSockets.socket(users[to]).emit('message', ready_data);

            return true;
        }
    };

    // Redis events
    rclient.on('message', function (channel, rawMsgData) {
        //console.log('get redis msg');
        var msgData = JSON.parse(rawMsgData),
            data,
            id_list,
            socket_id,
            i;

        if (channel === 'chat_system') {

            if (msgData.type === 'system') {

                //console.log('system msg');
                if (!users[msgData.to]) {
                    return;
                }

                data = {
                    'type': 'system',
                    'from': 'system',
                    'to': msgData.to,
                    'text': msgData.text,
                    'color': 'black'
                };

                sendMessage(data);
                //console.log('send redis system msg to chat');
            }

            if (msgData.type === 'locate') {
                //console.log('locate msg');
                data = {
                    'type': 'locate',
                    'from': msgData.from,
                    'to': 'loc_' + msgData.to,
                    'text': msgData.text,
                    'color': 'black'
                };

                sendMessage(data);
                //console.log('send redis locate msg to chat: '+msgData.to);            
            }

            if (msgData.type === 'private') {
                //console.log('private msg');
                data = {
                    'type': 'private',
                    'to': msgData.to,
                    'from': msgData.from,
                    'text': 'private (' + msgData.to + ') ' + msgData.text,
                    'color': 'black'
                };
                sendMessage(data);
                //console.log('send redis private msg to chat: '+msgData.to);
            }

            if (msgData.type === 'refresh') {

                console.log('refresh msg');

                id_list = msgData.uid.split(',');

                for (i = 0; i < id_list.length; i += 1) {

                    if (users_id[id_list[i]]) {

                        //console.log('send refresh to: '+id_list[i]);          
                        socket_id = users[users_id[id_list[i]]];

                        chatSockets.socket(socket_id).emit('message', {
                            "type": "refresh"
                        });
                    }
                }
            }

            return true;
        }

        if (channel === 'sys_cmd') {

            if (msgData.cmd === 'gags_reload') {

                libs.getUsersGags();
            }
        }
    });

    // Memcache events 
    mclient_reconnect_id = -1;

    mclient.on('connect', function () {

        console.log('Memcache connected');

        libs.getUsersGags();
    });

    mclient.on('close', function () {

        console.log('memcache disconnected');

        if (mclient_reconnect_id > -1) {

            clearTimeout(mclient_reconnect_id);
        }

        mclient_reconnect_id = setTimeout(function () {

            console.log("trying to reconnect Memcache..");

            mclient.connect();

        }, 5000);
    });

    mclient.on('error', function () {

        console.log('Memcache error');
    });

}());