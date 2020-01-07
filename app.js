const express = require('express');
const app = express();
const cors = require('cors');
const morgan = require('morgan');
var request = require('request');
var querystring = require('query-string');
var bodyparser = require('body-parser');
var cookieParser = require('cookie-parser');
var helmet = require('helmet');
var CryptoJS = require('crypto-js'); 
require('dotenv').config();

app.use(cors());
app.use(morgan('short'));
app.use(bodyparser.json());


app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.use(helmet());

app.use(cookieParser());


const Spotify_client_id = process.env.Spotify_client_id;

const Spotify_client_id_secret = process.env.Spotify_client_id_secret;

const Spotify_redirect_uri = process.env.Spotify_redirect_uri;

const scope = process.env.scope;

const key = process.env.key; 

const iv = process.env.iv; 

app.use(express.static(__dirname + '/public'));


app.listen(3003, function (req, res, error) {

  if (error) {
    throw (error);
  }

  console.log("Server is up and running");

});

app.get('/home', function (req, res) {  

  res.render('/Spotify/views/pages/index.ejs');

})

app.get('/login', function (req, res) {

  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      client_id: Spotify_client_id,
      response_type: 'code',
      redirect_uri: Spotify_redirect_uri,      
      scope: scope,
      show_dialog: 'off'
    })

  );
})

app.get('/results', function (req, res) { 

  //this array will hold the artist info that will be returned to the results.ejs file 
  var info = [];

  //promise chain will ensure the necessary data is obtained before moving on to the next function 
  var x = get_access_token();

  var access_token;

  x.then(function (retrieved_token) { //the first function will obtain the access token and set it equal to the access_token variable
    access_token = retrieved_token;  
    return artist('long_term'); //once we have the access token, we can then use this to query the api endpoint for the top artists
  }).then(function (top_artists) {//we get the response returned from the promise and push this into the 'info array'
    info.push(top_artists);
    return tracks('long_term');
  }).then(function (top_tracks) {
    info.push(top_tracks);
    return tracks('short_term');
  }).then(function (top_recent_tracks) {
    info.push(top_recent_tracks)
    return info;
  }).then(function (info) {//at the end we will receive a 2D array of users top played artists, top played tracks, and recent top played tracks 

    var top_played_artists = info[0];

    var top_played_tracks = info[1];

    var top_recently_played_tracks = info[2];

    if (!req.cookies.a_t) { //if this cookies does not exist, we need to create it     

      //the expiration time for the access token is 1 hour given by Spotify in seconds , but Date in javascript uses milliseconds so we must multiply 3600 by 1000 
      //we encrypt the token so if someone gets ahold of the token they will not be able to use as they do not have access to the decryption function      
      res.cookie('a_t', encrypt(access_token), { expires: new Date(Date.now() + 3600000) }); 
    }

    res.render('/Spotify/views/pages/results.ejs', {//here we must pass the necessary parameters to theh ejs view 
      top_played_artists: top_played_artists,
      top_played_tracks: top_played_tracks,
      top_recently_played_tracks: top_recently_played_tracks
    })

  }).catch(function (error) {
    res.render('/Spotify/views/pages/error.ejs');    
    return error;
  })


  function get_access_token() { //this function will obtain the access token    

    var promise = new Promise(function (resolve, reject) {      

      if (req.cookies.a_t) { //if the access token cookie exists, we can use this and resolve the promise        

        resolve(decrypt(req.cookies.a_t));         
        return;

      }

      else if (typeof (req.query.code) == "undefined") { //if the cookie exists and no code is provided, we must redirect to login and obtain a code to get the access token 
        res.redirect('/login');
        return;
      }

      request.post({ //get access token for api access
        url: 'https://accounts.spotify.com/api/token',
        form: {

          grant_type: "authorization_code",

          code: req.query.code,

          redirect_uri: Spotify_redirect_uri
        },

        headers: {

          'Authorization': 'Basic ' + (new Buffer.from(Spotify_client_id + ':' + Spotify_client_id_secret).toString('base64')) //base64 encode client id and client id secrect

        },

        json: true

      }, function (error, body, response) {

        if (error) {
          res.render('/Spotify/views/pages/error.ejs')
          reject(error);
          return;
        }

        else {

          access_token = response.access_token;    
        
          resolve(access_token); 

          return;           
        };
      })
    });

    return promise;
  }

  //this functions get top artists listened to 
  function artist(time_range) {
    var promise = new Promise(function (resolve, reject) {

      request.get({ //need to perform get request at this endpoint
        url: 'https://api.spotify.com/v1/me/top/artists?',

        qs: {
          limit: 50,

          offset: 0,

          time_range: time_range
        },

        headers: {
          'Authorization': 'Bearer ' + access_token
        },

        json: true

      },
        function (error, body, response) {         

          var array_artists = response.items; //the response array resides here 

          var artists = array_artists.map(array_artists => array_artists.name); //we can map through this array and get only the data we need 

          if (error) {
            reject(error);
          }
          else {
            resolve(artists);
          }
        })
    })

    return promise;
  }

  //this functioin gets top tracks listened to
  function tracks(time_range) {
    var promise = new Promise(function (resolve, reject) {

      request.get({
        url: 'https://api.spotify.com/v1/me/top/tracks?',

        qs: {
          limit: 50,

          offset: 0,

          time_range: time_range
        },

        headers: {
          'Authorization': 'Bearer ' + access_token
        },

        json: true

      },
        function (error, body, response) {

          if (error) {
            reject(error);
          }

          else {

            var array_tracks = response.items; //spotify api response is here 

            var tracks = array_tracks.map(array_tracks => array_tracks.name); //spotify returns data in array, so we can use map function to go through each element and get the data we need 

            var artists = array_tracks.map(array_tracks => array_tracks.artists[0].name) //spotify returns an artists array with each response so we must access artists name for each song as such 

            var tracks_artists = []; //the return array

            for (var i = 0; i < tracks.length; i++) { //we then concat each track with its respective artist

              tracks_artists.push(tracks[i] + " by " + artists[i]);
            }


            resolve(tracks_artists);
          }

        })
    })

    return promise;
  }


  function encrypt(plain_text){ //here we encrypt the access token using AES-256 bit encryption with a key and IV

    var cipher_text = CryptoJS.AES.encrypt(plain_text, key, {iv: iv}); 

    return cipher_text.toString(); 

  }


  function decrypt(cipher_text){

    var bytes = CryptoJS.AES.decrypt(cipher_text.toString(), key, {iv: iv}); 

    var plain_text = bytes.toString(CryptoJS.enc.Utf8); 

    return plain_text; 

  }


})

app.get('*', function (req, res) { //if any another page is requested by the user not listed above in the app.get routes, we will redirect the user to an error page

  //404 error page   
  res.render('/Spotify/views/pages/notfound.ejs');  
  return;
})