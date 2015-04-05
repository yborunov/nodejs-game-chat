(function () {
	'use strict';

	// stop chat server
	var fs = require('fs');

	fs.readFile(__dirname + '/chat.pid', 'utf8', function (err, pid) {

		if (err) {

			console.log(err);

		} else if (pid.match(/^[0-9]+$/)) {

	    	process.kill(pid);
	    }
	});
}());