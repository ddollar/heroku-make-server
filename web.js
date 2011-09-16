require.paths.unshift(__dirname + '/lib');

var express = require('express');
var spawner = require('spawner').create();
var sys     = require('sys');
var uuid    = require('node-uuid');

var app = express.createServer(
  express.logger(),
  express.cookieParser(),
  express.session({ secret: process.env.SESSION_SECRET }),
  require('connect-form')({ keepExtensions: true })
);

var knox = require('knox').createClient({
  key: process.env.AMAZON_KEY,
  secret: process.env.AMAZON_SECRET,
  bucket: process.env.AMAZON_BUCKET
});

var s3_host = 'http://' + process.env.AMAZON_BUCKET + '.s3.amazonaws.com';

app.post('/make', function(request, response, next) {
  if (! request.form) {
    response.send('invalid');
  } else {
    request.form.complete(function(err, fields, files) {
      if (err) {
        next(err);
      } else {
        console.log('fields: %s', sys.inspect(request.params));
        console.log('uploaded %s to %s', files.code.filename, files.code.path);

        var input_id = uuid();
        var output_id = uuid();

        response.header('X-Output-Location', s3_host + '/output/' + output_id + '.tgz');

        knox.putFile(files.code.path, '/input/' + input_id + '.tgz', function(err, res) {
          var input_url  = '/input/' + input_id + '.tgz';
          var output_url = '/output/' + output_id + '.tgz';
          var command    = './configure --prefix=/tmp/vendor/memcached && make install';
          var prefix     = '/tmp/vendor/memcached';

          var make_args = [ input_url, output_url, command, prefix ].map(function(arg) {
            return('"' + arg + '"');
          }).join(' ');

          var ls = spawner.spawn('bin/make ' + make_args, function(err) {
            console.log('couldnt spawn: ' + err);
          });

          ls.on('error', function(error) {
            console.log('error: ' + error);
          });

          ls.on('data', function(data) {
            response.write(data);
          });

          ls.on('exit', function(code) {
            response.end();
          });
        });
      }
    });
  }
});

var port = process.env.PORT || 3000;
console.log('listening on port ' + port);
app.listen(port);
