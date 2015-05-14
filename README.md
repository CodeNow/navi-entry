# navi-entry
A redis list class for navi entries

## Usage
NaviEntry is a [RedisList](https://github.com/tjmehta/redis-types#lists) with some additional methods

Init
```js
var opts = {
  containerPort: '80',
  branch:       'branch',
  instanceName: 'instanceName',
  ownerUsername: 'ownerUsername',
  userContentDomain: 'runnableapp.com'
};

var naviEntry = new NaviEntry(opts);
```
