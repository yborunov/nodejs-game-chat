/*jslint unparam: true */
(function () {
    'use strict';

    var crypto = require('crypto'),
        Iconv  = require('iconv').Iconv,
        iconv,

        mclient,
        users_gags,

        libs = {};

    iconv = new Iconv('utf-8', 'windows-1251');

    // Selecting players gags info from
    libs.getUsersGags = function () {

        console.log('selecting gags');

        mclient.get('gags', function (error, result) {

            if (error) {

                console.log('error: ' + error + ', result: ' + result);

                setTimeout(function () {
                    libs.getUsersGags();
                }, 15 * 1000);

            } else {

                //console.log('return: '+result);
                if (result) {

                    console.log('got gags: ' + result);

                    users_gags = JSON.parse(result);
                    //console.log(users_gags);

                } else {

                    console.log('error getting gags');
                }
            }
        });
    };

    libs.convert_tocp1251 = function (value) {

        var new_val = '';

        try {

            new_val = iconv.convert(value);

        } catch (e) {

            console.log('convert_tocp1251: value=' + value + ', error: ' + e);
        }

        return new_val;
    };

    libs.make_md5 = function (text) {

        var md5 = "",
            md5sum;

        try {

            md5sum = crypto.createHash('md5');
            md5sum.update(text);
            md5 = md5sum.digest("hex");

        } catch (e) {

            console.log('make_md5: text=' + text + ", error: " + e);
        }

        return md5;
    };

    libs.escapeHtml = function (unsafe) {

        return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    };

    module.exports = function (mclientArg, users_gagsArg) {

        mclient = mclientArg;
        users_gags = users_gagsArg;

        return libs;
    };

}());