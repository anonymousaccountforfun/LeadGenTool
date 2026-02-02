/**
 * LeadGenTool - Business Discovery and Lead Generation Library
 *
 * This module exports all public APIs for the LeadGenTool package.
 */

// ============================================================================
// Core Business Discovery (scraper)
// ============================================================================
export {
  discover,
  classifyQuery,
  type ScrapedBusiness,
  type SearchFilters,
  type QueryType,
} from './scraper';

// ============================================================================
// Email Discovery
// ============================================================================
export {
  findEmail,
  findEmailEnhanced,
  findEmailsEnhancedBatch,
  findEmailComprehensive,
  findEmailsComprehensiveBatch,
  type EmailResult,
  type EnhancedEmailResult,
  type BusinessForEmailSearch,
  type ComprehensiveEmailResult,
  type BusinessForComprehensiveSearch,
} from './email-finder';

export {
  findEmailsParallel,
  chunkBusinesses,
  calculateOptimalConcurrency,
  type BusinessEmailInput,
  type BusinessEmailResult,
} from './parallel-email-finder';

// ============================================================================
// Data Quality
// ============================================================================
export {
  // Quality metrics and enrichment
  enrichBusiness,
  deduplicateBusinesses,
  mergeDuplicates,
  recalculateOverallScore,
  calculateCrossRefScore,
  sortByQuality,
  processBusinessBatch,
  calculateBusinessSimilarity,
  // String comparison utilities
  jaroWinkler,
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeName,
  extractNameTokens,
  compareNames,
  // Phone utilities
  normalizePhone,
  formatPhone,
  validatePhone,
  // Address utilities
  normalizeAddress,
  parseAddress,
  compareAddresses,
  // Website utilities
  normalizeWebsite,
  extractDomain,
  validateWebsite,
  // Email validation
  validateEmail,
  // Types
  type QualityMetrics,
  type EnrichedBusiness,
  type DeduplicationResult,
} from './data-quality';

export {
  estimateCompanySize,
  estimateFromReviews,
  estimateFromYearsInBusiness,
  detectMultiLocation,
  estimateFromLinkedIn,
  combineEstimates,
  matchesCompanySizeFilter,
  classifyBusinessType,
  type CompanySizeEstimate,
  type CompanySizeInput,
} from './company-size';

export {
  detectIndustryType,
  enrichWithIndustryData,
  flattenIndustryData,
  parseIndustryData,
  getIndustryExportHeaders,
  getIndustryExportValues,
  extractRestaurantData,
  extractContractorData,
  extractMedicalData,
  extractSalonData,
  type IndustryType,
  type RestaurantData,
  type ContractorData,
  type MedicalData,
  type SalonData,
  type RetailData,
  type ProfessionalServicesData,
  type AutomotiveData,
  type FitnessData,
  type IndustrySpecificData,
  type EnrichmentInput,
} from './industry-enrichment';

export {
  calculateConfidenceScore,
  batchCalculateScores,
  recordConfirmedEmail,
  explainScore,
  analyzePatternPerformance,
  type ScoringFactors,
  type ConfidenceScore,
  type EmailScoreInput,
  type PatternTestResult,
} from './ml-scoring';

// ============================================================================
// Caching
// ============================================================================
export {
  // Business caching
  getCachedBusiness,
  cacheBusiness,
  cacheBusinesses,
  // Email caching
  getCachedEmail,
  cacheEmail,
  // Search results caching
  getCachedSearchResults,
  cacheSearchResults,
  // Rate limiting
  getRateLimitState,
  setRateLimitState,
  // Catch-all caching
  getCachedCatchAll,
  cacheCatchAll,
  // Pattern caching
  getCachedPattern,
  cachePattern,
  // Cache management
  getCacheStats,
  resetCacheStats,
  checkCacheHealth,
  clearAllCaches,
  // Types
  type CachedBusiness,
  type CachedEmail,
  type CachedSearchResults,
  type RateLimitState,
  type CachedPattern,
} from './cache';

// ============================================================================
// Export Functionality
// ============================================================================
export {
  exportBusinesses,
  generateCsv,
  generateTsv,
  generateJson,
  generateExcel,
  generateHubSpotCsv,
  generateSalesforceCsv,
  generatePipedriveCsv,
  generateMailchimpCsv,
  getAvailableFormats,
  EXPORT_COLUMNS,
  CRM_FIELD_MAPPINGS,
  type ExportFormat,
  type ExportOptions,
  type ExportColumn,
  type JsonExportBusiness,
  type JsonExport,
  type ExportResult,
} from './export';

// ============================================================================
// Configuration
// ============================================================================
export {
  loadConfig,
  validateConfig,
  clearConfigCache,
  type Config,
  type StealthConfig,
  type ProxyConfig,
  type RateLimitConfig,
  type ApiFallbackConfig,
} from './config';

// ============================================================================
// Error Handling
// ============================================================================
export {
  // Retry and circuit breaker
  withRetry,
  isRetryableError,
  isCircuitOpen,
  recordSuccess,
  recordFailure,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  resetAllCircuitBreakers,
  getAllCircuitBreakerStatuses,
  // Partial results handling
  withPartialResults,
  // Friendly errors
  toFriendlyError,
  // Graceful handling
  withGracefulHandling,
  getRetrySuggestions,
  clearAllErrorHandlingState,
  // Error classes
  PartialResultsError,
  CircuitBreakerError,
  RetryExhaustedError,
  // Types
  type RetryOptions,
  type CircuitBreakerOptions,
  type CircuitState,
  type CircuitBreakerStatus,
  type SourceResult,
  type PartialResults,
  type ErrorSuggestion,
  type FriendlyError,
} from './error-handling';

export {
  // Base error classes
  AppError,
  ValidationError,
  InvalidQueryError,
  InvalidLocationError,
  InvalidCountError,
  RateLimitError,
  BrowserlessRateLimitError,
  BrowserError,
  BrowserConnectionError,
  BrowserTimeoutError,
  DatabaseError,
  DatabaseConnectionError,
  ScrapingError,
  SourceBlockedError,
  JobNotFoundError,
  JobProcessingError,
  // Utility functions
  withRetry as withRetryLegacy,
  withTimeout,
  getErrorMessage,
  isRateLimitError,
  isRetryableError as isRetryableErrorLegacy,
} from './errors';
