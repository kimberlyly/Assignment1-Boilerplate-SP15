//dependencies for each module used
var express = require('express');
var passport = require('passport');
var InstagramStrategy = require('passport-instagram').Strategy;
var FacebookStrategy = require ('passport-facebook').Strategy;
var http = require('http');
var path = require('path');
var handlebars = require('express-handlebars');
var bodyParser = require('body-parser');
var session = require('express-session');
var cookieParser = require('cookie-parser');
var dotenv = require('dotenv');
var Instagram = require('instagram-node-lib');
var graph = require('fbgraph');
var mongoose = require('mongoose');
var app = express();

//local dependencies
var models = require('./models');

//client id and client secret here, taken from .env
dotenv.load();
var INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
var INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
var INSTAGRAM_CALLBACK_URL = process.env.INSTAGRAM_CALLBACK_URL;
var INSTAGRAM_ACCESS_TOKEN = "";
Instagram.set('client_id', INSTAGRAM_CLIENT_ID);
Instagram.set('client_secret', INSTAGRAM_CLIENT_SECRET);

var FACEBOOK_CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
var FACEBOOK_CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;
var FACEBOOK_CALLBACK_URL = process.env.FACEBOOK_CALLBACK_URL;
var FACEBOOK_ACCESS_TOKEN = "";

//variables that need to be saved throughout program
var instaAccount, fbAccount;

//connect to database
mongoose.connect(process.env.MONGODB_CONNECTION_URL);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
  console.log("Database connected succesfully.");
});

// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Instagram profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});


// Use the InstagramStrategy within Passport.
//   Strategies in Passport require a `verify` function, which accept
//   credentials (in this case, an accessToken, refreshToken, and Instagram
//   profile), and invoke a callback with a user object.
passport.use(new InstagramStrategy({
    clientID: INSTAGRAM_CLIENT_ID,
    clientSecret: INSTAGRAM_CLIENT_SECRET,
    callbackURL: INSTAGRAM_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    // asynchronous verification, for effect...
    models.InstaUser.findOrCreate({
      "name": profile.username,
      "id": profile.id,
      "access_token": accessToken 
    }, function(err, user, created) {
      
      // created will be true here
      models.InstaUser.findOrCreate({}, function(err, user, created) {
        // created will be false here
        process.nextTick(function () {
          // To keep the example simple, the user's Instagram profile is returned to
          // represent the logged-in user.  In a typical application, you would want
          // to associate the Instagram account with a user record in your database,
          // and return that user instead.
          return done(null, profile);
//            return done(null, user);
        });
      })
    });
  }
));

// Use the FacebookStrategy within Passport.
passport.use(new FacebookStrategy({
  clientID: FACEBOOK_CLIENT_ID,
  clientSecret: FACEBOOK_CLIENT_SECRET,
  callbackURL: FACEBOOK_CALLBACK_URL
  },
  function(accessToken, refreshToken, profile, done) {
    models.FBUser.findOrCreate({
      "name": profile.username,
      "id": profile.id,
      "access_token": accessToken
    }, function(err, user) {
      if (err) { return done(err); }
      done(null, user);
    });
  }
));

//Configures the Template engine
app.engine('handlebars', handlebars({defaultLayout: 'layout'}));
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({ secret: 'keyboard cat',
                  saveUninitialized: true,
                  resave: true}));
app.use(passport.initialize());
app.use(passport.session());

//set environment ports and start application
app.set('port', process.env.PORT || 3000);

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { 
    return next(); 
  }
  res.redirect('/login');
}

/* Method to set info from authenticated Instagram */
function setInstaInfo(instaUser) {
  instaAccount = instaUser;
}

/* Method to get info from authenticated Instagram */
function getInstaInfo() {
  return instaAccount;  
}

/* Method to set info from authenticated Facebook */
function setFBInfo(fbUser) {
  fbAccount = fbUser;
}

/* Method to get info from authenticated Facebook */
function getFBInfo() {
  return fbAccount;
}

//routes
app.get('/', function(req, res){
  res.render('home', { headertext: "Welcome", paragraph: "This is Instabook, an app that seamlessly integrates your Instagram and Facebook information into one convenient location on the web." });
});

app.get('/login', function(req, res){
  res.render('login', { user: req.user, headertext: "Welcome", paragraph: "This is Instabook, an app that seamlessly integrates your Instagram and Facebook information into one convenient location on the web." });
});

app.get('/account', ensureAuthenticated, function(req, res){ 
  var fbUser; // to be populated
  var instaInfo = getInstaInfo();
  var instaUser = getInstaInfo().user; 
  graph.get('/me?fields=name,gender,birthday,statuses.limit(1),picture,friends', function (err, data) {
    fbUser = { "name": data.name, "gender": data.gender, "birthday": data.birthday, "status": data.statuses.data[0].message, "profile": data.picture.data.url, "friends": data.friends.summary.total_count };
    res.render('account', { fbUser: fbUser, instaInfo: instaUser });
  });
});

app.get('/photos', ensureAuthenticated, function(req, res){
  var fbArr = [], imageArr = [];
  var instaInfo = getInstaInfo();
  var instaquery  = models.InstaUser.where({ name: getInstaInfo().user.username });
    instaquery.findOne(function (err, user) {
      if (err) return handleError(err);
      if (user) {
        // doc may be null if no document matched
        Instagram.users.recent({
          user_id: user.id,
          access_token: user.access_token,
          complete: function(data) {
            //Map will iterate through the returned data obj
            imageArr = data.map(function(item) {
              //create temporary json object
              tempJSON = {};
              tempJSON.url = item.images.low_resolution.url;
                   
              if (item.caption.text) {
                tempJSON.caption = item.caption.text;
              }
              //insert json object into image array
              return tempJSON;
            });
          }
        }); 
      }
    });
  graph.get('/me?fields=photos', function (err, data) {
    for (var a = 0; a < data.photos.data.length; a++) {
      tempJSON = {};
      tempJSON.url = data.photos.data[a].source;
      fbArr.push(tempJSON);
    }
    res.render('photos', { photos: imageArr, fbphotos: fbArr });
  });
});

app.get('/home', function(req, res) {
  res.render('home');
});

app.get('/popular', ensureAuthenticated, function(req, res) {
  var maxFbLikes = -1, maxInstaLikes = -1;
  var maxFbMessage, maxInstaPhoto, maxInstaCaption;
  var instaInfo = getInstaInfo();
  var instaquery  = models.InstaUser.where({ name: getInstaInfo().user.username });
    instaquery.findOne(function (err, user) {
      if (err) return handleError(err);
      if (user) {
        // doc may be null if no document matched
        Instagram.users.recent({
          user_id: user.id,
          access_token: user.access_token,
          count: 1000,
          complete: function(data) {
            //Map will iterate through the returned data obj
            for (var i = 0; i < data.length; i++) {
              if (data[i].likes) {
                if (data[i].likes.count > maxInstaLikes) {
                  maxInstaLikes = data[i].likes.count;
                  maxInstaPhoto = data[i].images.low_resolution.url;
               	  if (data[i].caption.text) {
                    maxInstaCaption = data[i].caption.text; 
                  }
		            }
              }
            }
            }
            });
          }
        }); 
  graph.get('/me?fields=statuses.limit(100){likes.limit(1000),message}', function (err, data) {
    for (var i = 0; i < data.statuses.data.length; i++) {
      if (data.statuses.data[i].likes) {
        if (data.statuses.data[i].likes.data.length > maxFbLikes) {
          maxFbLikes = data.statuses.data[i].likes.data.length;
          maxFbMessage = data.statuses.data[i].message;
        }
      }
    }
    res.render('popular', { message: maxFbMessage, likes: maxFbLikes, photo: maxInstaPhoto, instaLikes: maxInstaLikes, instaCaption: maxInstaCaption });
  });
    });

// GET /auth/instagram
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Instagram authentication will involve
//   redirecting the user to instagram.com.  After authorization, Instagram
//   will redirect the user back to this application at /auth/instagram/callback
app.get('/auth/instagram',
  passport.authenticate('instagram'),
  function(req, res){
    // The request will be redirected to Instagram for authentication, so this
    // function will not be called.
  });

// GET /auth/instagram/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/instagram/callback', 
  passport.authenticate('instagram', { failureRedirect: '/login'}),
  function(req, res) {
    setInstaInfo(req);
    res.redirect('/auth/facebook');
  });

app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['user_about_me', 'user_birthday', 'user_friends', 'user_photos', 'user_relationships', 'user_likes', 'user_posts', 'user_status', 'read_stream'] }));
app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { failureRedirect: '/login'}),
  function(req, res) {
    setFBInfo(req);
    graph.setAccessToken(req.user.access_token);
    res.redirect('/account');
  });
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});
