/*jslint unparam: true */
(function () {
    'use strict';

    var EventEmitter = require('events').EventEmitter,

        chatSockets = null,
        users = [],
        m = {};

    m.roomsModuleInit = function (_chatSockets) {

        chatSockets = _chatSockets;
    };

    m.addUser = function (userId, userLogin, userSocket) {

        users.push({
            id: userId,
            login: userLogin,
            socket: userSocket
        });
    };

    m.delUser = function (userId) {

        var i;

        for (i = 0; i < users.length; i += 1) {

            if (users[i].id === userId) {

                users.splice(i, 1);
            }
        }
    };

    module.exports = new EventEmitter();
    module.exports = m;
}());