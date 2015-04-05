# Node.js game chat

WGlads.com game chat server written in Node.js

It uses Memcache and Redis for storing chat messages and additional information.

Communication with client happens via Web Sockets using Socket.IO library

## Supports
* Users authorization based on secret key personal for each user
* Different chat channels
* Automatic users blocking after sending messages containing prohibited information
* Persistent storing of messages