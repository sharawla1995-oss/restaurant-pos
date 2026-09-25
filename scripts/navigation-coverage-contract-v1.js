'use strict';

const SHADOW_VERIFIED=Object.freeze([
  'customers',
  'orders',
  'foodIngredients',
  'foodRecipes',
  'foodOperations',
  'tables',
  'marketSettings',
  'retailOffers'
]);

const CONFLICT_BLOCKED=Object.freeze([
  'suppliers',
  'purchasing',
  'stockCount',
  'transfers'
]);

const DEFERRED_FIX=Object.freeze([
  'home',
  'pos',
  'returns',
  'promoCodes',
  'deliveryOrders',
  'delivery',
  'deliverySettings',
  'kitchen',
  'inventory',
  'internalSupply',
  'employees',
  'advances',
  'adjustments',
  'payroll',
  'treasury',
  'expenses',
  'shifts',
  'reports',
  'products',
  'websiteManagement',
  'branchProductAvailability',
  'websiteBranchSettings',
  'websitePayments',
  'websiteAppearance',
  'users',
  'settings',
  'retailWebsiteOrders',
  'pharmacyCatalog',
  'pharmacyBatches',
  'pharmacyExpiry',
  'pharmacyPrescriptions',
  'pharmacyInsurance',
  'pharmacyClaims'
]);

module.exports=Object.freeze({
  version:'1.0.0-1e',
  allowedCoverageStates:Object.freeze(['SHADOW_VERIFIED','CONFLICT_BLOCKED','DEFERRED_FIX']),
  excludedTargets:Object.freeze(['summary']),
  shadowVerified:SHADOW_VERIFIED,
  conflictBlocked:CONFLICT_BLOCKED,
  deferredFix:DEFERRED_FIX,

  runtimeEvidence:Object.freeze({
    customers:Object.freeze({status:'SHADOW_MATCH',signature:'app-customers-v1'}),
    orders:Object.freeze({status:'SHADOW_LOCKED_MATCH',signature:'orders-v58-3'}),
    foodIngredients:Object.freeze({status:'SHADOW_MATCH',signature:'restaurant-ingredients-v55'}),
    foodRecipes:Object.freeze({status:'SHADOW_MATCH',signature:'restaurant-recipes-v55'}),
    foodOperations:Object.freeze({status:'SHADOW_MATCH',signature:'restaurant-food-operations-v55'}),
    tables:Object.freeze({status:'SHADOW_MATCH',signature:'restaurant-tables-v55'}),
    marketSettings:Object.freeze({status:'SHADOW_MATCH',check:'restaurant-no-market-settings',actualVisible:false}),
    retailOffers:Object.freeze({status:'SHADOW_MATCH',check:'restaurant-no-retail-offers',actualVisible:false}),
    purchasing:Object.freeze({status:'SHADOW_CONFLICT_BLOCKED',signature:'purchasing-conflict-active-route'})
  }),

  allowedDatasetPageMechanisms:Object.freeze([
    'homePage',
    'pharmacyPage',
    'beta54Page',
    'beta55SupplyPage'
  ]),

  allowedDataPageAttributes:Object.freeze([
    'page',
    'home-page',
    'pharmacy-page',
    'beta54-page',
    'beta55-supply-page'
  ]),

  allowedNavIds:Object.freeze({
    retailWebsiteOrdersNav:'route',
    ownerDiagnosticsNav:'diagnostic',
    betaSelfTestNav:'diagnostic'
  }),

  knownNavWriters:Object.freeze({
    'app.js':'canonical-route-owner',
    'beta29-retail-functional-finalization.js':'route-proxy-augmentation',
    'beta54-shared-core-ui.js':'route-owner',
    'beta55-central-warehouse-ui.js':'route-owner',
    'beta55-navigation-parity.js':'route-proxy-augmentation',
    'beta55-restaurant-closure-ui.js':'route-owner',
    'beta55-ui-workflow-fixes.js':'group-augmentation',
    'purchasing-attachments-v1.js':'route-augmentation',
    'pharmacy-ui.js':'profile-route-owner',
    'retail-website-pos.js':'profile-route-owner',
    'owner-diagnostics.js':'diagnostic-navigation',
    'beta-self-test.js':'diagnostic-navigation'
  }),

  diagnosticNavIds:Object.freeze(['ownerDiagnosticsNav','betaSelfTestNav']),
  pharmacyRoutes:Object.freeze([
    'pharmacyCatalog','pharmacyBatches','pharmacyExpiry',
    'pharmacyPrescriptions','pharmacyInsurance','pharmacyClaims'
  ]),
  retailWebsiteRoute:'retailWebsiteOrders'
});
