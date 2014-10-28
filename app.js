/**
 * Module dependencies.
 */

var express = require('express'),
    app = express();
var http = require('http');
var path = require('path');
var fs = require('fs');
var pg = require('pg.js');

//var mongo = require('mongodb');
//var fs = require('fs');

var environment = process.env.NODE_ENV || 'development';
var publicDir = path.join(__dirname, 'public');
var client = null;
// all environments
app.set('port', process.env.PORT || 3300);

// disable layout
app.set("view options", {layout: false});

//app.use(express.favicon());
//app.use(express.bodyParser());
//app.use(express.methodOverride());
//app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
//if ('development' == app.get('env')) {
  // use development db
  //app.use(express.errorHandler());
//}


// DB client
try {
       var data = fs.readFileSync('db.json','utf-8');
       client = new pg.Client(JSON.parse(data));
       client.connect(function(err) {
        if (err) {
          console.error('Could not connect to postgres', err);
        } });
} catch(e) {
    console.error('Unable to read database configuration: '+e);
}

// pass in all dependency references
//var routes = require('./routes/api')(app, db, ObjectID, credentials);

var libs = {
  parse : require('./sources/parse'),
  store : require('./sources/store'),
  delete_template : require('./sources/delete_template'),
  delete_config : require('./sources/delete_config'),
  select : require('./sources/select')  
}

var routes = require('./routes/api')(app, path, client, libs);


// the startup sequence is async, therefore start the server only if everything else also works
//function startServer() {
    //http.createServer(app).listen(app.get('port'), function(){
      //console.log('Express server listening on port ' + app.get('port'));
    //});
//}

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});