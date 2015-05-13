'use strict';

var url = require('url');
var redisTypes = require('redis-types');
var RedisList  = redisTypes.List;
var exists = require('101/exists');
var isString = require('101/is-string');
var requireOpt = function (opts, key) {
  if (!exists(opts[key])) {
    var message = 'opts.' + key + ' is required';
    throw new Error(message);
  }
};
var formatOpts = function (opts) {
  requireOpt(opts, 'ownerUsername');
  requireOpt(opts, 'instanceName');
  requireOpt(opts, 'masterPod');
  requireOpt(opts, 'userContentDomain');
  requireOpt(opts, 'exposedPort');
  opts.exposedPort = opts.exposedPort.split('/')[0];
};

module.exports = NaviEntry;

/**
 * Create hipache host (redis list)
 * @param  {Object|String}  optsOrKey      options or key
 * @param  {String}    opts.exposedPort    container.ports hash key - ex: "80/tcp"
 * @param  {String}    opts.ownerUsername  instance owner's username
 * @param  {String}    [opts.instance]     instance json (including name, cv and masterPod)
 *                                           required if masterPod, branchName, instanceName not provided
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
 * create a NaviEntry instance from host
 * @param  {String} host  host of an instance container
 * @return {NaviEntry}    naviEntry
 */
NaviEntry.createFromHost = function (host) {
  return this.createFromUrl('http://'+host);
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
    if (this.opts.branch) {
      this._createElasticKey();
      this._createDirectKey();
    }
    else { // masterPod w/out repo, ex: mongo
      this._createElasticKey();
    }
  }
  else { // direct, ex: auto launch
    this._createDirectKey();
  }
};

/**
 * Create redis elastic key from opts, sets this.elasticKey
 */
NaviEntry.prototype._createElasticKey = function () {
  this.elasticKey = [
    'frontend:',
    this.opts.exposedPort, '.',
    this.opts.instanceName,
    '-staging-', this.opts.ownerUsername, '.',
    this.opts.userContentDomain
  ].join('').toLowerCase();
};

/**
 * Create redis direct key from opts, sets this.directKey
 */
NaviEntry.prototype._createDirectKey = function () {
  this.directKey = [
    'frontend:',
    this.opts.exposedPort, '.',
    this.opts.branch, '-',
    this.opts.instanceName,
    '-staging-', this.opts.ownerUsername, '.',
    this.opts.userContentDomain
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
 * @param {String} backendUrl should be a full url including protocol and port, ex: http://10.0.1.1:80
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
      .rpush(elasticKey, this.opts.instanceName)
      .rpush(elasticKey, backendUrl);
  }
  if (directKey) {
    task
      .del(directKey)
      .rpush(directKey, this.opts.instanceName)
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
 * get the instance name from the navi entry list
 * @param  {getInstanceNameCb} cb
 */
/**
 * @callback getInstanceNameCb
 * @param {Error}  err
 * @param {String} instanceName instance name in redis
 */
NaviEntry.prototype.getInstanceName = function (cb) {
  return this.lindex(0, cb);
};

/**
 * get the elastic url associated with the naviEntry
 * NOTE: should only be used for a naviEntry with a DIRECT key
 * @param   {String} [branch]  branch that instance is for
 * @return  {String} elasticHostname
 */
NaviEntry.prototype.getElasticHostname = function (branch) {
  if (!this.elasticKey) {
    branch = this._validateBranch(branch);
  }
  var elasticRe = new RegExp('^frontend:[0-9]+[.]');
  var directRe = new RegExp('^frontend:[0-9]+[.]'+branch+'-');
  return this.elasticKey ?
    this.elasticKey.replace(elasticRe, ''):
    this.directKey.replace(directRe, '');
};

/**
 * get the elastic url associated with the naviEntry
 * NOTE: should only be used for a naviEntry with a ELASTIC key
 * @param   {String} [branch]  branch that instance is for
 * @return  {String} elasticHostname
 */
NaviEntry.prototype.getDirectHostname = function (branch) {
  branch = this._validateBranch(branch);
  var re = new RegExp('^frontend:[0-9]+[.]');
  return this.elasticKey ?
    this.elasticKey.replace(re, branch+'-'):
    this.directKey.replace(re, '');
};

/**
 * validate branch for get_Hostname functions
 * NOTE: should only be used for a naviEntry with a ELASTIC key
 * @param   {String} [branch]  branch that instance is for
 */
NaviEntry.prototype._validateBranch = function (branch) {
  branch = branch || this.opts.branch;
  if (!branch) {
    throw new Error('branch or opts.branch is required');
  }
  return branch;
};
