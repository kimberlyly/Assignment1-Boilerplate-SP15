var mongoose = require('mongoose');
var findOrCreate = require('mongoose-findorcreate');


var userSchema = mongoose.Schema({
	"name" : { type: String },
	"id" : { type: String },
  "access_token" : { type: String }
});

userSchema.plugin(findOrCreate);

exports.FBUser = mongoose.model('FBUser', userSchema);
exports.InstaUser = mongoose.model('InstaUser', userSchema);
