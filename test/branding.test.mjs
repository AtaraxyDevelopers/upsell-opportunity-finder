import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
test('The official company logo is served as unchanged PNG bytes', async()=>{
 const app=createApp({memory:true});app.listen(0,'127.0.0.1');await once(app,'listening');
 try {const response=await fetch('http://127.0.0.1:'+app.address().port+'/ataraxy-developers-logo.png');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),'87ebc5a0092af0fff4524e805730ca3dc97c4483bd49f866528b8cdb97d422e7');}
 finally {app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
});
