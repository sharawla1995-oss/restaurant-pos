(function(){
  const KEY='topburger-theme';
  const root=document.documentElement;
  const mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
  function stored(){try{return localStorage.getItem(KEY)||'auto'}catch(_){return 'auto'}}
  function effective(mode){return mode==='auto'?(mq&&mq.matches?'dark':'light'):mode}
  function apply(mode){
    if(!['light','dark','auto'].includes(mode))mode='auto';
    root.dataset.theme=effective(mode);
    root.dataset.themeMode=mode;
    root.style.colorScheme=effective(mode);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content',effective(mode)==='dark'?'#111214':'#b51f2b');
    document.querySelectorAll('[data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===mode));
  }
  function set(mode){try{localStorage.setItem(KEY,mode)}catch(_){} apply(mode)}
  function mount(){
    if(document.getElementById('themeChooser'))return;
    const box=document.createElement('div');
    box.id='themeChooser'; box.className='theme-chooser';
    box.innerHTML='<span>المظهر</span><div><button type="button" data-theme-choice="light">☀️ فاتح</button><button type="button" data-theme-choice="dark">🌙 داكن</button><button type="button" data-theme-choice="auto">⚙️ تلقائي</button></div>';
    const panel=document.querySelector('.drawer-panel');
    if(panel)panel.appendChild(box); else document.body.appendChild(box);
    box.addEventListener('click',e=>{const b=e.target.closest('[data-theme-choice]');if(b)set(b.dataset.themeChoice)});
    apply(stored());
  }
  apply(stored());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
  if(mq){const onChange=()=>{if(stored()==='auto')apply('auto')}; if(mq.addEventListener)mq.addEventListener('change',onChange);else if(mq.addListener)mq.addListener(onChange)}
})();
