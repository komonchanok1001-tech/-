const express=require('express');
const http=require('http');
const {Server}=require('socket.io');
const crypto=require('crypto');
const app=express(); const server=http.createServer(app);const io=new Server(server,{cors:{origin:false}});
app.use(express.static('public'));
const cases=[
 {title:'น้ำเกลือปริศนา',material:'น้ำเกลือ',goal:'ต้องการแยกเกลือออกจากน้ำเกลือ',correct:true,reason:'น้ำระเหยออก เหลือเกลือที่ละลายอยู่เป็นของแข็ง'},
 {title:'ทรายล่องหน',material:'น้ำผสมทราย',goal:'ต้องการแยกทรายออกจากน้ำ',correct:false,reason:'การกรองเหมาะกว่า เพราะทรายไม่ละลายน้ำ'},
 {title:'เกลือจากทะเล',material:'น้ำทะเล',goal:'ต้องการผลิตเกลือจากน้ำทะเล',correct:true,reason:'การระเหยของน้ำทำให้เกลือเข้มข้นและตกผลึก'},
 {title:'น้ำสะอาด',material:'น้ำโคลน',goal:'ต้องการเก็บน้ำกลับมาใช้',correct:false,reason:'การระเหยแห้งไม่เก็บน้ำกลับมา การกรองช่วยแยกตะกอน แต่ไม่ได้ทำให้น้ำดื่มได้ทันที'},
 {title:'น้ำตาลที่หายไป',material:'น้ำเชื่อม',goal:'ต้องการได้น้ำตาลกลับมาโดยไม่ให้ไหม้',correct:false,reason:'การต้มจนแห้งเสี่ยงให้น้ำตาลเปลี่ยนสภาพ ควรใช้การตกผลึกภายใต้สภาวะที่เหมาะสม'},
 {title:'ผลึกสีขาว',material:'น้ำผสมผงชูรส',goal:'ต้องการแยกของแข็งที่ละลายในน้ำ',correct:true,reason:'ระเหยน้ำเพื่อให้เหลือของแข็งได้ โดยควบคุมความร้อนให้เหมาะสม'}
];
const rooms=new Map();const clean=s=>String(s||'').trim().slice(0,60);
function code(){let c;do{c=crypto.randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(c));return c}
function standings(r){return [...r.players.values()].map(p=>({id:p.id,name:p.name,klass:p.klass,number:p.number,score:p.score,answered:p.answers.size,connected:p.connected})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'th'))}
function state(r,teacher=false){return {room:r.code,phase:r.phase,index:r.index,deadline:r.deadline,duration:r.duration,count:r.players.size,answered:r.index>=0?[...r.players.values()].filter(p=>p.answers.has(r.index)).length:0,question:r.index>=0?{title:cases[r.index].title,material:cases[r.index].material,goal:cases[r.index].goal}:null,standings:teacher||r.phase==='finished'?standings(r):null,reason:teacher&&r.phase==='reveal'?cases[r.index].reason:null,correct:teacher&&r.phase==='reveal'?cases[r.index].correct:null}}
function emit(r){io.to(r.code).emit('state',state(r));if(r.teacherSocket)io.to(r.teacherSocket).emit('teacher-state',state(r,true))}
function fail(s,msg){s.emit('error-msg',msg)}
function teacherOnly(s,fn){const r=rooms.get(s.data.room);if(!r||s.data.role!=='teacher'||s.data.secret!==r.secret)return fail(s,'ไม่มีสิทธิ์ควบคุมห้อง');fn(r)}
function finishQuestion(r){if(r.phase!=='question')return;r.phase='reveal';r.deadline=null;for(const p of r.players.values()){const a=p.answers.get(r.index);if(a!==undefined&&a===cases[r.index].correct)p.score+=100;}emit(r)}
io.on('connection',s=>{
 s.on('create-room',(data,cb)=>{const r={code:code(),secret:crypto.randomBytes(18).toString('hex'),teacherSocket:s.id,phase:'lobby',index:-1,duration:Math.max(10,Math.min(120,Number(data?.duration)||30)),deadline:null,players:new Map(),timer:null,created:Date.now()};rooms.set(r.code,r);s.data={room:r.code,role:'teacher',secret:r.secret};s.join(r.code);cb?.({ok:true,room:r.code,secret:r.secret});emit(r)});
 s.on('restore-teacher',(data,cb)=>{const r=rooms.get(clean(data?.room).toUpperCase());if(!r||r.secret!==data?.secret)return cb?.({ok:false,error:'ไม่พบห้องหรือรหัสครูไม่ถูกต้อง'});r.teacherSocket=s.id;s.data={room:r.code,role:'teacher',secret:r.secret};s.join(r.code);cb?.({ok:true});emit(r)});
 s.on('join-room',(data,cb)=>{const r=rooms.get(clean(data?.room).toUpperCase());if(!r)return cb?.({ok:false,error:'ไม่พบรหัสห้อง'});if(r.phase==='finished')return cb?.({ok:false,error:'เกมจบแล้ว'});const name=clean(data?.name),klass=clean(data?.klass),number=clean(data?.number);if(!name)return cb?.({ok:false,error:'กรุณากรอกชื่อ'});const id=clean(data?.playerId)||crypto.randomUUID();let p=r.players.get(id);if(!p){p={id,name,klass,number,score:0,answers:new Map(),connected:true};r.players.set(id,p)}else{p.connected=true;p.name=name;p.klass=klass;p.number=number} s.data={room:r.code,role:'student',playerId:id};s.join(r.code);cb?.({ok:true,playerId:id});emit(r)});
 s.on('answer',(data,cb)=>{const r=rooms.get(s.data.room);const p=r?.players.get(s.data.playerId);if(!r||!p||r.phase!=='question'||r.index!==data?.index||p.answers.has(r.index)||Date.now()>r.deadline)return cb?.({ok:false,error:'ไม่สามารถส่งคำตอบได้'});if(typeof data.choice!=='boolean')return cb?.({ok:false,error:'คำตอบไม่ถูกต้อง'});p.answers.set(r.index,data.choice);cb?.({ok:true});emit(r)});
 s.on('next',()=>teacherOnly(s,r=>{if(r.timer)clearTimeout(r.timer);if(r.phase==='question')return fail(s,'กรุณาปิดรับคำตอบก่อน');if(r.index>=5){r.phase='finished';r.deadline=null;emit(r);return}r.index++;r.phase='question';r.deadline=Date.now()+r.duration*1000;r.timer=setTimeout(()=>finishQuestion(r),r.duration*1000);emit(r)}));
 s.on('close-question',()=>teacherOnly(s,r=>{if(r.timer)clearTimeout(r.timer);finishQuestion(r)}));
 s.on('set-duration',v=>teacherOnly(s,r=>{if(r.phase!=='lobby')return;r.duration=Math.max(10,Math.min(120,Number(v)||30));emit(r)}));
 s.on('end-game',()=>teacherOnly(s,r=>{if(r.timer)clearTimeout(r.timer);if(r.phase==='question')finishQuestion(r);r.phase='finished';emit(r)}));
 s.on('disconnect',()=>{const r=rooms.get(s.data.room);if(!r)return;if(s.data.role==='student'){const p=r.players.get(s.data.playerId);if(p)p.connected=false;emit(r)}})
});
setInterval(()=>{for(const [k,r] of rooms)if(Date.now()-r.created>12*3600*1000){if(r.timer)clearTimeout(r.timer);rooms.delete(k)}},3600000).unref();
server.listen(process.env.PORT||3000,()=>console.log('Game server running'));
