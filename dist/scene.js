import * as THREE from './vendor/three.module.min.js';

// A real WebGL scene; the supplied logo remains the source of the brand surface.
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 760px)').matches;
for (const host of document.querySelectorAll('[data-scene]')) {
  try { createScene(host); } catch { /* The supplied logo is the no-WebGL fallback. */ }
}

function createScene(host) {
  const hero = host.dataset.scene === 'hero';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, .3, hero ? 7.9 : 8.5);
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.7));
  renderer.setClearColor(0x17150f, hero ? 0 : 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  host.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: .83, roughness: .24 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171714, metalness: .5, roughness: .42 });
  scene.add(new THREE.HemisphereLight(0xffeed5, 0x4b3723, 2));
  [[-3,4,4,28],[3,1,3,18],[0,-3,4,10]].forEach(([x,y,z,intensity])=>{const light=new THREE.PointLight(0xffe8ad,intensity,20);light.position.set(x,y,z);scene.add(light)});
  const group = new THREE.Group();
  scene.add(group);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85,.035,10,mobile?72:120),gold);
  group.add(ring);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.78,.01,6,90),gold);
  group.add(innerRing);
  let thread, needle, curve;
  if (hero) {
    const points=[];
    // One continuous couture thread: bodice, waist, then widening skirt folds.
    points.push(new THREE.Vector3(-1.18,.95,0),new THREE.Vector3(-.5,.58,.05),new THREE.Vector3(.25,.72,0));
    for(let i=0;i<=240;i++){const t=i/240;const width=.18+t*.92;points.push(new THREE.Vector3(.35+Math.sin(t*Math.PI*25)*width, .68-t*1.85, Math.cos(t*Math.PI*25)*.09))}
    curve=new THREE.CatmullRomCurve3(points);
    const geo=new THREE.TubeGeometry(curve,mobile?400:800,.016,5,false);
    thread=new THREE.Mesh(geo,gold);group.add(thread);
    needle=new THREE.Mesh(new THREE.CylinderGeometry(.012,.022,1.7,8),gold);
    needle.rotation.z=.23;needle.position.set(-1.15,0,.05);group.add(needle);
    const eye=new THREE.Mesh(new THREE.TorusGeometry(.055,.012,5,20),gold);eye.scale.y=2;eye.position.set(-1.31,.8,.05);group.add(eye);
  } else {
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.79,1.79,.1,100),dark);
    disk.rotation.x=Math.PI/2;disk.position.z=-.07;group.add(disk);
    new THREE.TextureLoader().load('images/brand-original.png',texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.73,100),new THREE.MeshBasicMaterial({map:texture}));
      face.position.z=.015;group.add(face);render();
    });
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(2.2,2.3,.22,100),dark);
    platform.position.y=-2.03;scene.add(platform);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(2.21,.025,8,100),gold);
    rim.rotation.x=Math.PI/2;rim.position.y=-1.91;scene.add(rim);
    group.position.y=.1;
  }
  const count=mobile?18:65,coords=new Float32Array(count*3);
  for(let i=0;i<count;i++){coords[i*3]=(Math.random()-.5)*6;coords[i*3+1]=(Math.random()-.5)*5;coords[i*3+2]=-Math.random()*2}
  const particleGeo=new THREE.BufferGeometry();particleGeo.setAttribute('position',new THREE.BufferAttribute(coords,3));
  const particles=new THREE.Points(particleGeo,new THREE.PointsMaterial({color:0xe9c875,size:hero?.025:.018,transparent:true,opacity:.55}));scene.add(particles);
  let mouseX=0,mouseY=0,visible=true,raf=0,start=performance.now();
  function render(){renderer.render(scene,camera)}
  function resize(){const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();render()}
  const ro=new ResizeObserver(resize);ro.observe(host);resize();host.classList.add('scene-loaded');
  host.addEventListener('pointermove',event=>{if(mobile||reduced.matches)return;const r=host.getBoundingClientRect();mouseX=(event.clientX-r.left)/r.width-.5;mouseY=(event.clientY-r.top)/r.height-.5});
  host.addEventListener('pointerleave',()=>{mouseX=mouseY=0});
  function tick(now){raf=0;if(!visible||document.hidden)return;const t=(now-start)/1000;
    if(!reduced.matches){group.rotation.y=(hero?Math.sin(t*.22)*.3:Math.sin(t*.18)*.18)+mouseX*.3;group.rotation.x=mouseY*.12;particles.rotation.z=t*.013;
      if(thread){const progress=Math.min(1,t/6);thread.geometry.setDrawRange(0,Math.floor(thread.geometry.index.count*progress/3)*3);if(progress<1){needle.position.copy(curve.getPointAt(progress));needle.position.x-=.12;needle.rotation.z=.25} }
    }else{group.rotation.set(0,0,0);if(thread)thread.geometry.setDrawRange(0,Infinity)}
    render();if(!reduced.matches)raf=requestAnimationFrame(tick);
  }
  function restart(){cancelAnimationFrame(raf);raf=requestAnimationFrame(tick)}
  const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)restart();else cancelAnimationFrame(raf)});io.observe(host);
  reduced.addEventListener('change',restart);document.addEventListener('visibilitychange',restart);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);ro.disconnect();io.disconnect();renderer.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose()}})},{once:true});
}
