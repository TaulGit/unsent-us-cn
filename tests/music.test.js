import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
import {createMusicController} from '../src/music.js';

function setup(fadeMs = 0) {
  const media = new Map();
  const errors = [];
  const controller = createMusicController({fadeMs, onError:error=>errors.push(error), createMedia(url,scene) {
    const player = {
      src:url, paused:true, ended:false, currentTime:0, volume:0, plays:0,
      async play(){this.plays++;if(this.fail)throw new Error('play rejected');this.paused=false;},
      pause(){this.paused=true;},
    };
    media.set(scene,player);return player;
  }});
  return {controller,media,errors};
}

test('音乐等首次交互才开始，反复渲染同一场景不重播或重置播放位置', async()=>{
  const {controller,media}=setup();
  controller.setTrack('investigation');
  const first=media.get('investigation');
  assert.equal(first.plays,0);
  await controller.unlock();first.currentTime=37;
  for(let i=0;i<6;i++){controller.setTrack('investigation');await controller.unlock();}
  assert.equal(first.plays,1);assert.equal(first.currentTime,37);assert.equal(first.loop,true);
  controller.dispose();
});

test('广告及后台暂停后从原位置恢复；关闭声音后不会被恢复事件擅自开启', async()=>{
  const {controller,media}=setup();controller.setTrack('reunion');await controller.unlock();
  const track=media.get('reunion');track.currentTime=42;
  controller.pause(true);assert.equal(track.paused,true);
  controller.pause(false);await wait(0);
  assert.equal(track.paused,false);assert.equal(track.currentTime,42);
  await controller.setEnabled(false);controller.pause(true);controller.pause(false);await controller.unlock();
  assert.equal(track.paused,true);assert.equal(controller.isEnabled(),false);
  await controller.setEnabled(true);assert.equal(track.paused,false);assert.equal(track.currentTime,42);
  controller.dispose();
});

test('切换重逢与结局会淡出旧曲，快速回看时不会被旧定时器停止当前曲', async()=>{
  const {controller,media}=setup(30);controller.setTrack('investigation');await controller.unlock();await wait(65);
  controller.setTrack('reunion');await wait(10);controller.setTrack('ending');await wait(10);controller.setTrack('investigation');await wait(90);
  assert.equal(media.get('investigation').paused,false);
  assert.equal(media.get('reunion').paused,true);assert.equal(media.get('ending').paused,true);
  assert.equal(media.get('ending').loop,false);
  assert(media.get('investigation').volume>0.4);
  controller.dispose();
});

test('结局自然结束后不会因重绘、广告恢复或重复交互重新开始', async()=>{
  const {controller,media}=setup();controller.setTrack('ending');await controller.unlock();
  const track=media.get('ending');track.ended=true;track.paused=true;track.currentTime=90;
  controller.setTrack('ending');await controller.unlock();controller.pause(true);controller.pause(false);await wait(0);
  assert.equal(track.plays,1);assert.equal(track.currentTime,90);
  controller.setTrack('reunion');await wait(0);track.ended=false;controller.setTrack('ending');await wait(0);
  assert.equal(track.currentTime,0);assert.equal(track.plays,2);
  controller.dispose();
});

test('浏览器阻止播放或解码失败不破坏游戏，后续用户操作可重试', async()=>{
  const {controller,media,errors}=setup();controller.setTrack('investigation');
  const track=media.get('investigation');track.fail=true;
  assert.equal(await controller.unlock(),false);assert.equal(errors.length,1);
  track.fail=false;assert.equal(await controller.unlock(),true);assert.equal(track.paused,false);
  controller.dispose();assert.equal(track.paused,true);assert.equal(await controller.unlock(),false);
});
