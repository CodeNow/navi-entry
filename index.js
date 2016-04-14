'use strict';

var url = require('url');
var redisTypes = require('redis-types');
var RedisList  = redisTypes.List;
var exists = require('101/exists');
var put = require('101/put');
var isString = require('101/is-string');
var runnableHostname = require('@runnable/hostname');
var ErrorCat = require('error-cat');

var requireOpt = function (opts, key) {
  if (!exists(opts[key])) {
    var message = 'opts.' + key + ' is required';
    throw new Error(message);
  }
};
var formatOpts = function (opts) {
  requireOpt(opts, 'exposedPort');
  requireOpt(opts, 'shortHash');
  requireOpt(opts, 'instanceName');
  requireOpt(opts, 'ownerUsername');
  requireOpt(opts, 'userContentDomain');
  requireOpt(opts, 'masterPod');
  requireOpt(opts, 'ownerGithub');
  opts.exposedPort = opts.exposedPort.split('/')[0];
};

module.exports = NaviEntry;

/**
 * Create hipache host (redis list)
 * @param  {Object|String}  optsOrKey      options or key
 * @param  {String}    opts.exposedPort    container.ports hash key - ex: "80/tcp"
 * @param  {String}    opts.ownerUsername  instance owner's username
 * @param  {String}    [opts.instanceName] instance name
 *                                           will override instance value if both are provided
 *                                           required if instance not provided
 * @param  {String}    [opts.branch]       instance's cv's repos branch
 *                                           will override instance value if both are provided
 *                                           required if instance not provided and not master pod
 * @param  {String}    [opts.masterPod]    whether instance is a masterPod
 *                                           will override instance value if both are provided
 *                                           defaults to false
 * @return {RedisList} hipache host   redis list
 */
function NaviEntry (optsOrKey) {
  var key, opts;
  if (isString(optsOrKey)) {
    key = optsOrKey;
  }
  else {
    opts = optsOrKey;
  }

  if (opts) {
    this.opts = opts;
    formatOpts(opts);

    // the new user domain is active. use the new domain scheme
    this._createKeys(opts);
    key = this.directKey || this.elasticKey;
  }
  else {
    this.opts = {};
  }
  // this key passing doesn't matter but calling RedisList validates
  // that redis-types has a redis client
  RedisList.call(this, key);
}

require('util').inherits(NaviEntry, RedisList);

/**
 * create a NaviEntry instance from a hostname (no protocol or port)
 * @param  {Object}    client    redis client to use for searching
 * @param  {String}    hostname  hostname of an instance container
 * @return {NaviEntry} naviEntry
 */
NaviEntry.createFromHostname = function (client, hostname, cb) {
  var key = [
    'frontend:*.',
    hostname
  ].join('').toLowerCase();
  client.keys(key, function(err, entries) {
    if (err) { return cb(err); }
    if (entries.length === 0) {
      return cb(ErrorCat.create(404, 'entry not found'));
    }
    // pick first key
    cb(null, new NaviEntry(entries[0]));
  });
};

/**
 * create a NaviEntry instance from uri
 * @param  {String} uri   uri of an instance container
 * @return {NaviEntry}    naviEntry
 */
NaviEntry.createFromUrl = function (uri) {
  var parsed = url.parse(uri);
  parsed.port = parsed.port || '80';
  var key = [
    'frontend:',
    parsed.port, '.',
    parsed.hostname
  ].join('').toLowerCase();
  return new NaviEntry(key.toLowerCase());
};

/**
 * Create redis key from opts
 * @param  {Object}    this.opts   options is required
 */
NaviEntry.prototype._createKeys = function () {
  if (this.opts.masterPod) { // master w/ repo, ex: api master
    this._createElasticKey();
  }
  if (this.opts.branch) {
    this._createDirectKey();
  } else { // Non repo container
    this._createElasticKey();
  }
};

/**
 * Create redis elastic key from opts, sets this.elasticKey.
 * Only created when opts.masterPod:true
 */
NaviEntry.prototype._createElasticKey = function () {
  this.elasticKey = [
    'frontend:', this.opts.exposedPort, '.', runnableHostname.elastic(this.opts)
  ].join('').toLowerCase();
};

/**
 * Create redis direct key from opts, sets this.directKey
 */
NaviEntry.prototype._createDirectKey = function () {
  this.directKey = [
    'frontend:', this.opts.exposedPort, '.', runnableHostname.direct(this.opts)
  ].join('').toLowerCase();
};

/**
 * provide a redis client to navi entry
 * @param  {Object} redisClient from require('redis').createClient(opts)
 */
NaviEntry.setRedisClient = function (redisClient) {
  redisTypes({ redisClient: redisClient });
};

/**
 * sets the navi entry list values
 * @param {String} backendUrl should be a full url including protocol and port
 *                              ex: http://10.0.1.1:80
 * @param {Function} cb callback
 */
NaviEntry.prototype.setBackend = function (backendUrl, cb) {
  if (!this.opts.instanceName) {
    throw new Error('full opts are required');
  }
  var task = this.redisClient.multi();

  var elasticKey = this.elasticKey;
  var directKey = this.directKey;
  if (elasticKey) {
    // direct url for masterPod:true
    task
      .del(elasticKey)
      .rpush(elasticKey,
        JSON.stringify(put(this.opts, 'elastic', true))
      )
      .rpush(elasticKey, backendUrl);
  }
  if (directKey) {
    task
      .del(directKey)
      .rpush(directKey,
        JSON.stringify(put(this.opts, 'direct', true))
      )
      .rpush(directKey, backendUrl);
  }

  task.exec(cb);
};

/**
 * removes the navi entry list values
 * @param {Function} cb callback
 */
NaviEntry.prototype.del = function (cb) {
  if (!this.opts.instanceName) {
    throw new Error('full opts are required');
  }
  var task = this.redisClient.multi();

  var elasticKey = this.elasticKey;
  var directKey = this.directKey;
  if (elasticKey) {
    task.del(elasticKey);
  }
  if (directKey) {
    task.del(directKey);
  }

  task.exec(cb);
};

/**
 * get the instance and url info from the navi entry list
 * Note: only use this when specifying the redis key directly
 * @param  {getInstanceNameCb} cb
 */
/**
 * @callback getInstanceNameCb
 * @param {Error}  err
 * @param {String} instanceName instance name in redis
 */
NaviEntry.prototype.getInfo = function (cb) {
  return this.lindex(0, function (err, jsonStr) {
    if (err) { return cb(err); }
    jsonParse(jsonStr, cb);
  });
};
function jsonParse (str, cb) {
  var parsed = null;
  var err = null;
  try {
    parsed = JSON.parse(str);
  }
  catch (e) {
    err = e;
  }
  cb(err, parsed);
}
/**
 * get the elastic url associated with the naviEntry
 * NOTE: should only be used for a naviEntry with a DIRECT key
 * @param   {String} [branch]  branch that instance is for
 * @return  {String} elasticHostname
 */
NaviEntry.prototype.getElasticHostname = function (shortHash) {
  if (!this.elasticKey) {
    shortHash = this._validateShortHash(shortHash);
  }
  var elasticRe = new RegExp('^frontend:[0-9]+[.]', 'i');
  var directRe = new RegExp('^frontend:[0-9]+[.]'+shortHash+'-{1,2}', 'i');
  return this.elasticKey ?
    this.elasticKey.replace(elasticRe, ''):
    this.directKey.replace(directRe, '');
};

/**
 * get the elastic url associated with the naviEntry
 * NOTE: should only be used for a naviEntry with a ELASTIC key
 * @param   {String} [shortHash]  shortHash that instance is for
 * @return  {String} elasticHostname
 */
NaviEntry.prototype.getDirectHostname = function (shortHash) {
  shortHash = this._validateShortHash(shortHash);
  var re = new RegExp('^frontend:[0-9]+[.]', 'i');
  return this.elasticKey ?
    this.elasticKey.replace(re, shortHash+'-'):
    this.directKey.replace(re, '');
};

/**
 * validate shortHash for get_Hostname functions
 * NOTE: should only be used for a naviEntry with a ELASTIC key
 * @param   {String} [shortHash]  shortHash that instance is for
 */
NaviEntry.prototype._validateShortHash = function (shortHash) {
  shortHash = shortHash || this.opts.shortHash;
  if (!shortHash) {
    throw new Error('shortHash or opts.shortHash is required');
  }
  return shortHash;
};
