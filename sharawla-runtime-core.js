(function(global){
  'use strict';

  // Sharawla POS V10.5.2 — Multi-Industry Runtime Core.
  // Industry-specific navigation, permissions and operational page rules are
  // supplied by the installed profile engine. The Core stays industry-neutral.
  const engines=new Map();

  function normalizeCode(value){
    return String(value||'').trim().toLowerCase();
  }

  function normalizeModules(values){
    return [...new Set((Array.isArray(values)?values:[])
      .map(normalizeCode)
      .filter(Boolean))];
  }

  function clonePairs(values){
    return (Array.isArray(values)?values:[]).map(row=>Array.isArray(row)?[row[0],Array.isArray(row[1])?[...row[1]]:row[1]]:row);
  }

  function registerEngine(engine){
    const code=normalizeCode(engine?.code);
    if(!code)throw new Error('Sharawla Engine must provide a code.');
    if(typeof engine.resolveModules!=='function' || typeof engine.pageAllowed!=='function'){
      throw new Error(`Sharawla Engine ${code} is incomplete.`);
    }
    engines.set(code,Object.freeze({...engine,code}));
    return engines.get(code);
  }

  function getEngine(code){
    return engines.get(normalizeCode(code))||null;
  }

  function hasEngine(code){
    return !!getEngine(code);
  }

  function resolveEngine(config){
    const exact=getEngine(config?.pos_profile);
    if(exact)return exact;
    // During bootstrap there may be no Runtime Config yet. If this build only
    // contains one implemented engine, using it for static UI metadata is safe
    // and avoids hardcoding an industry name in app.js.
    if(!config && engines.size===1)return [...engines.values()][0];
    return null;
  }

  function prepareConfig(raw){
    if(!raw || typeof raw!=='object')throw new Error('Runtime Config is missing.');
    const profile=normalizeCode(raw.pos_profile);
    const engine=getEngine(profile);
    if(!engine)throw new Error(`Unsupported POS Profile: ${profile||'unknown'}`);

    const configured=raw.modules_configured===true;
    const requested=normalizeModules(raw.enabled_modules);
    const enabled=normalizeModules(engine.resolveModules(requested,configured,raw));

    return {
      business_id:String(raw.business_id||''),
      business_name:String(raw.business_name||''),
      pos_profile:profile,
      profile_active:raw.profile_active!==false,
      profile_implemented:raw.profile_implemented===true,
      modules_configured:configured,
      legacy_profile_compat:!configured,
      enabled_modules:enabled,
      updated_at:new Date().toISOString()
    };
  }

  function saveCache(storageKey,raw){
    const row=prepareConfig(raw);
    localStorage.setItem(storageKey,JSON.stringify(row));
    return row;
  }

  function loadCache(storageKey,businessId){
    try{
      const parsed=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(!parsed || String(parsed.business_id)!==String(businessId||''))return null;
      return prepareConfig(parsed);
    }catch{
      return null;
    }
  }

  function moduleEnabled(config,code){
    if(!config)return true;
    const engine=resolveEngine(config);
    if(!engine)return false;
    const wanted=normalizeCode(code);
    if(!wanted)return true;
    return normalizeModules(config.enabled_modules).includes(wanted);
  }

  function pageAllowed(config,page){
    if(!config)return true;
    const engine=resolveEngine(config);
    if(!engine)return false;
    return !!engine.pageAllowed(config,String(page||''));
  }

  function pageOperationalAllowed(config,page,settings){
    const engine=resolveEngine(config);
    if(!engine)return false;
    if(typeof engine.pageOperationalAllowed!=='function')return true;
    return !!engine.pageOperationalAllowed(config,String(page||''),settings||{});
  }

  function pageTitle(config,page){
    const engine=resolveEngine(config);
    if(!engine)return String(page||'');
    if(typeof engine.pageTitle==='function')return String(engine.pageTitle(String(page||''))||page||'');
    return String(page||'');
  }

  function allPages(config){
    const engine=resolveEngine(config);
    if(!engine)return ['home'];
    const rows=typeof engine.allPages==='function'?engine.allPages():engine.allPages;
    return [...new Set((Array.isArray(rows)?rows:['home']).map(String))];
  }

  function rolePages(config,role){
    const engine=resolveEngine(config);
    if(!engine)return ['home'];
    const rows=typeof engine.rolePages==='function'?engine.rolePages(String(role||'')):null;
    return [...new Set((Array.isArray(rows)?rows:['home']).map(String))];
  }

  function permissionDefs(config){
    const engine=resolveEngine(config);
    if(!engine)return [];
    const rows=typeof engine.permissionDefs==='function'?engine.permissionDefs():engine.permissionDefs;
    return clonePairs(rows);
  }

  function permissionGroups(config){
    const engine=resolveEngine(config);
    if(!engine)return [];
    const rows=typeof engine.permissionGroups==='function'?engine.permissionGroups():engine.permissionGroups;
    return clonePairs(rows);
  }

  global.SharawlaRuntimeCore=Object.freeze({
    normalizeCode,
    normalizeModules,
    registerEngine,
    getEngine,
    hasEngine,
    resolveEngine,
    prepareConfig,
    saveCache,
    loadCache,
    moduleEnabled,
    pageAllowed,
    pageOperationalAllowed,
    pageTitle,
    allPages,
    rolePages,
    permissionDefs,
    permissionGroups
  });
})(window);
