'use strict';

// Batch 1D-B pre-bind runtime signature contract.
// Source-only. Not loaded by index.html and not part of the runtime source graph.
const SIGNATURES=Object.freeze([
  Object.freeze({
    id:'app-customers-v1',routeKey:'customers',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderCustomers',navigationOwner:'app.js',
    sourceTokens:Object.freeze(['async function renderCustomers()','id="customerSearch"','id="customersBody"']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="customers"].active'}),
      Object.freeze({selector:'#customerSearch'}),
      Object.freeze({selector:'#customersBody'})
    ])
  }),
  Object.freeze({
    id:'orders-v58-3',routeKey:'orders',classification:'LOCKED',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderOrders',navigationOwner:'app.js',
    sourceTokens:Object.freeze(['async function renderOrders(opts={})','ORDERS-DATE-WINDOW-V58.3','data-orders-runtime="${runtimeMarker}"']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="orders"].active'}),
      Object.freeze({selector:'[data-orders-runtime="ORDERS-DATE-WINDOW-V58.3"]'})
    ])
  }),
  Object.freeze({
    id:'restaurant-tables-v55',routeKey:'tables',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderTables',navigationOwner:'beta55-restaurant-closure-ui.js',
    sourceTokens:Object.freeze(['async function renderTables()','restaurant-table-grid','🪑 الصالات والترابيزات']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="tables"].active'}),
      Object.freeze({selector:'.restaurant-table-grid'}),
      Object.freeze({selector:'#page h2',textIncludes:'الصالات والترابيزات'})
    ])
  }),
  Object.freeze({
    id:'restaurant-ingredients-v55',routeKey:'foodIngredients',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderIngredients',navigationOwner:'beta55-restaurant-closure-ui.js',
    sourceTokens:Object.freeze(['async function renderIngredients()','🧪 الخامات — الفرع الحالي','data-adjust=']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="foodIngredients"].active'}),
      Object.freeze({selector:'#page h2',textIncludes:'الخامات — الفرع الحالي'})
    ])
  }),
  Object.freeze({
    id:'restaurant-recipes-v55',routeKey:'foodRecipes',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderRecipes',navigationOwner:'beta55-restaurant-closure-ui.js',
    sourceTokens:Object.freeze(['async function renderRecipes()','🍲 الوصفات وFood Cost','data-activate=']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="foodRecipes"].active'}),
      Object.freeze({selector:'#page h2',textIncludes:'الوصفات وFood Cost'})
    ])
  }),
  Object.freeze({
    id:'restaurant-food-operations-v55',routeKey:'foodOperations',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta55-restaurant-closure-ui.js',renderer:'renderFoodOperations',navigationOwner:'beta55-restaurant-closure-ui.js',
    sourceTokens:Object.freeze(['async function renderFoodOperations()','restaurant-subtabs','data-tab="production"','data-op-body']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="foodOperations"].active'}),
      Object.freeze({selector:'.restaurant-subtabs'}),
      Object.freeze({selector:'[data-tab="production"]'}),
      Object.freeze({selector:'[data-op-body]'})
    ])
  }),
  Object.freeze({
    id:'beta54-employees',routeKey:'employees',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderEmployees',navigationOwner:'beta54-shared-core-ui.js',
    sourceTokens:Object.freeze(['async function renderEmployees()','الموظف هنا سجل HR مستقل عن حساب الدخول للبرنامج.','data-beta54-page']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="employees"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'الموظفون'}),
      Object.freeze({selector:'#page .beta54-toolbar'})
    ])
  }),
  Object.freeze({
    id:'beta54-advances',routeKey:'advances',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderAdvances',navigationOwner:'beta54-shared-core-ui.js',
    sourceTokens:Object.freeze(['async function renderAdvances()','السلفة أصل موظف وتتحرك ماليًا من الخزنة عند الصرف؛ ليست مصروف تشغيل.','data-beta54-page']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="advances"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'سلف الموظفين'}),
      Object.freeze({selector:'#page .beta54-toolbar'})
    ])
  }),
  Object.freeze({
    id:'beta54-adjustments',routeKey:'adjustments',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderAdjustments',navigationOwner:'beta54-shared-core-ui.js',
    sourceTokens:Object.freeze(['async function renderAdjustments()','الحركات Pending تدخل تلقائيًا في مسير المرتب الذي يغطي تاريخها.','beta54-table']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="adjustments"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'الخصومات والمكافآت'}),
      Object.freeze({selector:'#page .beta54-table'})
    ])
  }),
  Object.freeze({
    id:'beta54-payroll',routeKey:'payroll',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderPayroll',navigationOwner:'beta54-shared-core-ui.js',
    sourceTokens:Object.freeze(['async function renderPayroll()','الصافي = أساسي + إضافي + مكافآت − خصومات − قسط السلفة.','data-beta54-page']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="payroll"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'المرتبات'}),
      Object.freeze({selector:'#page .beta54-toolbar'})
    ])
  }),
  Object.freeze({
    id:'beta54-treasury',routeKey:'treasury',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'beta54-shared-core-ui.js',renderer:'renderTreasury',navigationOwner:'beta54-shared-core-ui.js',
    sourceTokens:Object.freeze(['async function renderTreasury()','إجمالي الداخل','صافي الحركة']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-beta54-page="treasury"].active'}),
      Object.freeze({selector:'#pageTitle',textEquals:'الخزنة'}),
      Object.freeze({selector:'#page .beta54-kpi'})
    ])
  }),
  Object.freeze({
    id:'central-warehouse-supply-v55',routeKey:'internalSupply',classification:'AUGMENTED',canonicalCapable:true,
    sourceOwner:'beta55-central-warehouse-ui.js',renderer:'render',navigationOwner:'beta55-central-warehouse-ui.js',
    augmentationLayers:Object.freeze(['beta55-central-warehouse-v2.js']),
    augmentationGlobals:Object.freeze([Object.freeze({layer:'beta55-central-warehouse-v2.js',globalName:'__SharawlaBeta55CentralWarehouseV2'})]),
    sourceTokens:Object.freeze(['async function render()','data-beta55-supply-page','b55s-toolbar','inventory.supply.view']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav [data-beta55-supply-page].active'}),
      Object.freeze({selector:'#page .b55s-toolbar'}),
      Object.freeze({selector:'#page .b55s-card'})
    ])
  }),
  Object.freeze({
    id:'app-users-permissions-v2',routeKey:'users',classification:'AUGMENTED',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderUsers',navigationOwner:'app.js',
    augmentationLayers:Object.freeze(['permissions-v2-ui.js']),
    augmentationGlobals:Object.freeze([Object.freeze({layer:'permissions-v2-ui.js',globalName:'__SharawlaPermissionsV2'})]),
    sourceTokens:Object.freeze(['async function renderUsers()','users-admin-head','user-management-list']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="users"].active'}),
      Object.freeze({selector:'#page .users-admin-head'}),
      Object.freeze({selector:'#page .user-management-list'})
    ])
  }),
  Object.freeze({
    id:'website-availability-app',routeKey:'branchProductAvailability',classification:'NORMAL',canonicalCapable:true,
    sourceOwner:'app.js',renderer:'renderWebsiteAvailability',navigationOwner:'websiteManagement hub',
    sourceTokens:Object.freeze(['async function renderWebsiteAvailability()','website-availability-panel','website-availability-table','data-site-tool="availability"']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#page .website-availability-panel'}),
      Object.freeze({selector:'#page .website-availability-table'})
    ])
  }),
  Object.freeze({
    id:'website-payments-deferred',routeKey:'websitePayments',classification:'DEFERRED',canonicalCapable:false,
    sourceOwner:'app.js',renderer:'renderWebsitePayments',navigationOwner:'websiteManagement hub',
    sourceTokens:Object.freeze(['async function renderWebsitePayments()','site-pay-list','webPayBranch','data-site-tool="payments"']),
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#webPayBranch'}),
      Object.freeze({selector:'#page .site-pay-list'})
    ])
  }),
  Object.freeze({
    id:'purchasing-conflict-active-route',routeKey:'purchasing',classification:'CONFLICT',canonicalCapable:false,
    runtimeChecks:Object.freeze([
      Object.freeze({selector:'#nav button[data-page="purchasing"].active'})
    ])
  })
]);

const VISIBILITY_CHECKS=Object.freeze([
  Object.freeze({id:'restaurant-no-market-settings',routeKey:'marketSettings',selector:'#nav button[data-page="marketSettings"]',profile:'restaurant',expectedVisible:false}),
  Object.freeze({id:'restaurant-no-retail-offers',routeKey:'retailOffers',selector:'#nav button[data-page="retailOffers"]',profile:'restaurant',expectedVisible:false})
]);

module.exports=Object.freeze({
  version:'1.0.0-1d-b-prebind',
  mode:'source-only-unbound',
  sandbox:Object.freeze({
    supportCode:'SH-0007',
    businessId:'91826502-590e-4afa-8826-2c0f4b99c490',
    backendHost:'xihcxydjnzemflhedzor.supabase.co',
    profile:'restaurant',
    channel:'beta'
  }),
  readinessGlobals:Object.freeze([
    '__SharawlaBeta54SharedCore',
    '__SharawlaRestaurantClosureV55',
    '__SharawlaBeta55CentralWarehouse'
  ]),
  signatures:SIGNATURES,
  visibilityChecks:VISIBILITY_CHECKS
});
