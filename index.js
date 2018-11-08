const WebTorrent = require('webtorrent');
const torClient = new WebTorrent();
const http = require('http');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const Redbird = require('redbird');

const redbird = new Redbird({
  port: 80,
  ssl: {
    port: 443,
    http2: false
  },
});

// https://support.assetbank.co.uk/hc/en-gb/articles/115005343247-Installing-Ffmpeg-on-Debian-GNU-Linux-Version-8-0-Jessie-

http.createServer(webReq).listen(8888);

redbird.register('example.com', 'http://localhost:8888', {
  ssl: {
    letsencrypt: {
      email: 'bleh@example.com', // Domain owner/admin email
      // production: true, // WARNING: Only use this flag when the proxy is verified to work correctly to avoid being banned!
    }
  }
});

var MIME = {
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript'
};

var extMime = {
  mkv: 'video/x-matroska',
  mp4: 'video/mp4',
  avi: 'video/x-msvideo'
};

function webReq (req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Credentials': false,
      'Access-Control-Max-Age': '86400', // 24 hours
      'Access-Control-Allow-Headers': 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept'
    });
    return res.end();
  }

  if (req.url === '/favicon.ico') {
    res.writeHead(200);
    res.end();
    return;
  }

  var hash, file;

  var ffpegMatch = req.url.split('?')[0].match(/\/ffmpeg\/([a-z0-9]*)\/(.*)/i);

  if (ffpegMatch) {
    hash = ffpegMatch[1];
    file = ffpegMatch[2];

    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'video/webm'
    });

    var options = {
      quality: '240',
      seek: '0:00',
    };

    var query = req.url.split('?').pop();

    var qualityMatch = query.match(/q=(\d+)/);
    if (qualityMatch)
      options.quality = qualityMatch[1];

    var seekMatch = query.match(/s=(\d+)/);
    if (seekMatch) {
      var date = new Date(null);
      date.setSeconds(parseInt(seekMatch[1])); // specify value for SECONDS here
      options.seek = date.toISOString().substr(11, 8);
    }

    console.log('stream options', options);

    return streamFile(hash, file)
      .then(playFile => {
        var command = ffmpeg(playFile.createReadStream())
          .videoCodec('libvpx')
          .audioCodec('libvorbis')
          .seek(options.seek)
          .format('webm')
          .size('?x' + options.quality)
          .audioBitrate(64)
          .videoBitrate(256)
          .outputOptions([
            // '-threads 2',
            '-deadline realtime',
            '-error-resilient 1'
          ])
          .on('start', function (cmd) {
            console.log('start', cmd);
          })
          .on('error', function (err) {
            console.error(err);
          });
        command.pipe(res);
      })
      .catch(err => {
        console.error(err);
      });
  }

  var playMatch = req.url.split('?')[0].match(/\/play\/([a-z0-9]*)\/(.*)/i);

  if (playMatch) {
    hash = playMatch[1];
    file = playMatch[2];

    return streamFile(hash, file)
      .then(playFile => {
        var total = playFile.length;
        var ext = playFile.name.toLowerCase().split('.').pop();

        if (req.headers['range']) {
          var range = req.headers.range;
          var parts = range.replace(/bytes=/, '').split('-');
          var partialstart = parts[0];
          var partialend = parts[1];

          var start = parseInt(partialstart, 10);
          var end = partialend ? parseInt(partialend, 10) : total - 1;
          var chunksize = (end - start) + 1;
          // console.log('RANGE: ' + start + ' - ' + end + ' = ' + chunksize);

          var file = playFile.createReadStream({
            start: start,
            end: end
          });

          res.writeHead(206, {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': extMime[ext]
          });
          file.pipe(res);
        } else {
          console.log('ALL: ' + total);
          res.writeHead(200, {
            'Content-Length': total,
            'Content-Type': extMime[ext],
            'filename': playFile.name
          });
          playFile.createReadStream().pipe(res);
        }
      }).catch(err => {
        console.error(err);
      });
  }

  var hashMatch = req.url.match(/btih:([a-z0-9]*)/i);

  if (hashMatch && hashMatch[1]) {
    return loadTorrent(hashMatch[1])
      .then(torrent => {
        res.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        });
        res.end(JSON.stringify({
          hash: hashMatch[1],
          name: torrent.name,
          files: torrent.files.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}))
        }));
      })
      .catch(err => {
        console.error(err);
      });
  }

  // staticFiles
  if (req.url === '' || req.url === '/')
    req.url = '/index.html';

  return fs.readFile('./dist/' + req.url, 'utf8', (err, data) => {
    if (err) {
      res.writeHead(404, {
        'Content-Type': 'text/html'
      });
      res.end('i dunno ' + req.url);
    }
    var ext = req.url.split('.').pop();

    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/html'
    });
    res.end(data);
  });
}

function streamFile (hash, file) {
  return new Promise((resolve, reject) => {
    var torrent = torClient.torrents.find(t => t.infoHash === hash);
    if (!torrent) return reject();

    var playFile = torrent.files.find(f => f.name.replace(/\s/igm, '-').toLowerCase() === file);
    if (!playFile) {
      console.log(file);
      return Promise.reject('no file');
    }

    playFile.select();

    setTimeout(_ => {
      resolve(playFile);
    }, 1000);
  });
}

function loadTorrent (hash) {
  var torrent = torClient.torrents.find(t => t.infoHash === hash);
  if (torrent)
    return extractMedia(torrent)
      .then(files => {
        return {
          name: torrent.name,
          files
        };
      });
  return new Promise((resolve, reject) => {
    var magLink = 'magnet:?xt=urn:btih:' + hash + '&dn=The.Big.Bang.Theory.S12E04.HDTV.x264-SVA&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Fzer0day.ch%3A1337&tr=udp%3A%2F%2Fopen.demonii.com%3A1337&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Fexodus.desync.com%3A6969';
    torClient.add(magLink, function (torrent) {
    // pause the torrent while we check the files
      torrent.deselect(0, torrent.pieces.length - 1, false);
      extractMedia(torrent).then(files => {
        resolve({
          name: torrent.name,
          files
        });
      });
    });
  });
}

function extractMedia (torrent) {
  return new Promise((resolve, reject) => {
    var mediaFiles = [];
    torrent.files.forEach(file => {
      var ext = file.name.toLowerCase().split('.').pop();
      if (extMime[ext])
        mediaFiles.push({
          name: file.name,
          slug: file.name.replace(/\s/igm, '-').toLowerCase(),
          length: file.length
        });
    });
    resolve(mediaFiles);
  });
}
