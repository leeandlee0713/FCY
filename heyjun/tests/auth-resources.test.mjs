import test from 'node:test';
import assert from 'node:assert/strict';
import {signupToken,AUTH_RETURN_URL} from '../js/auth.js';
import {SUPABASE_URL} from '../js/config.js';
import {encodeResource,decodeResource} from '../js/resources.js';
test('confirmation accepts only this project signup links, without navigation',()=>{
 const token='a'.repeat(64);
 assert.deepEqual(signupToken(`${SUPABASE_URL}/auth/v1/verify?token=${token}&type=signup&redirect_to=http://localhost:3000`),{token_hash:token,type:'signup'});
 for(const url of [`https://evil.test/auth/v1/verify?token=${token}&type=signup`,`${SUPABASE_URL}/auth/v1/verify?token=${token}&type=recovery`,`${SUPABASE_URL}/auth/v1/verify?token=bad&type=signup`,'javascript:alert(1)'])assert.throws(()=>signupToken(url));
 assert.equal(AUTH_RETURN_URL,'https://leeandlee0713.github.io/FCY/heyjun/');
});
test('storybook serialization preserves existing resources, text and category',()=>{
 const story={category:'storybook',examples:[{ko:'안녕',en:'Hello'}],title:'동화'};
 const stored=encodeResource(story);assert.equal(stored.category,'expression');assert.deepEqual(decodeResource(stored),story);
 for(const category of ['grammar','expression']){const old={...story,category};assert.deepEqual(decodeResource(encodeResource(old)),old);}
});
