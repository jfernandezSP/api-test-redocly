// plugin.js

// Helper function to convert various string formats to SCREAMING_SNAKE_CASE
function toScreamingSnakeCase(str) {
  if (!str) return '';
  return String(str)
    .replace(/[\s-]+/g, '_') // Replace spaces and hyphens with underscores
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2') // AAAb -> A_A_Ab
    .replace(/([a-z\d])([A-Z])/g, '$1_$2') // aB -> a_B
    .toUpperCase();
}

// Helper function to singularize a resource name (simple version)
function singularize(word) {
    if (!word) return '';
    const lowercaseWord = word.toLowerCase();
    // Handle specific known plurals that should not be naively singularized if needed
    if (lowercaseWord === 'states' || lowercaseWord === 'status') return toScreamingSnakeCase(word); // Avoid 'STATE' from 'STATES' if 'STATES' is the actual resource name
    if (lowercaseWord.endsWith('s') && lowercaseWord.length > 1 && lowercaseWord !== 'news') { // added 'news' as example
        return toScreamingSnakeCase(word.slice(0, -1));
    }
    return toScreamingSnakeCase(word);
}


const techPrefixes = ['P', 'T', 'J', 'N', 'PY'];
const techPrefixRegex = `^(${techPrefixes.join('|')})_`;
// Project prefix: SCREAMING_SNAKE_CASE, at least one char group
const projectPrefixRegexPart = `[A-Z0-9]+(?:_[A-Z0-9]+)*`;
const fullPrefixRegex = new RegExp(`${techPrefixRegex}${projectPrefixRegexPart}_`);

module.exports = {
  id: 'isrg-styleguide-endpoint-naming-conventions',
  rules: {
    oas3: {
      'operation-id-screaming-snake-case': {
        description: 'Operation ID MUST be in SCREAMING_SNAKE_CASE.',
        message: 'Operation ID "{{property}}" is not in SCREAMING_SNAKE_CASE. Expected format: ALL_CAPS_UNDERSCORE_SEPARATED.',
        severity: 'error',
        given: '$.paths[*][*].operationId',
        then: {
          function: 'pattern',
          functionOptions: {
            match: '^[A-Z0-9]+(_[A-Z0-9]+)*$',
          },
        },
      },
      'operation-id-required-prefix': {
        description: 'Operation ID MUST start with a technology prefix (P, T, J, N, PY) followed by a project prefix in SCREAMING_SNAKE_CASE.',
        message: 'Operation ID "{{value}}" must start with a valid technology prefix (P_, T_, J_, N_, PY_) followed by a project prefix (e.g., P_MYPROJECT_).',
        severity: 'error',
        given: '$.paths[*][*].operationId',
        then: {
          function: 'pattern',
          functionOptions: {
            // Example: P_PROJECT_ID_..., PY_ANOTHER_PROJECT_...
            match: `^(${techPrefixes.join('|')})_[A-Z0-9]+(?:_[A-Z0-9]+)*_`,
          },
        },
      },
      'operation-summary-includes-operation-id': {
        description: 'Operation summary SHOULD include the operationId for easy reference.',
        message: 'Operation summary does not seem to contain the operationId "{{operationId}}".',
        severity: 'warn', // As per "RECOMMENDED"
        given: '$.paths[*][*]',
        resolved: true, // We need the resolved operation object
        then: {
          function: (operation, options, { path, rule }) => {
            if (!operation.operationId || !operation.summary) {
              return [];
            }
            if (!operation.summary.includes(operation.operationId)) {
              return [{
                message: `Operation summary "${operation.summary}" does not contain the operationId "${operation.operationId}".`,
                path: [...path, 'summary'],
              }];
            }
            return [];
          },
        },
      },
      'operation-id-structure-matches-path-and-method': {
        description: 'Operation ID MUST be structured based on the URL, HTTP method, and specified patterns.',
        severity: 'error',
        resolved: true, // We need the full operation and its context
        given: '$.paths[*][*]', // targets each operation object
        then: {
          function: (operation, opts, context) => {
            const errors = [];
            const operationId = operation.operationId;
            const httpMethod = context.path[context.path.length -1].toLowerCase(); // get, post, etc.
            let apiPath = context.path[context.path.length - 2]; // e.g., /orders/{id}/items

            if (!operationId) {
              // This will be caught by 'operation-operationId-defined' if enabled, or is not this rule's concern.
              return [];
            }

            // Extract the part of operationId after the TECH_PROJECT prefix
            const prefixMatch = operationId.match(fullPrefixRegex);
            if (!prefixMatch) {
              // This should be caught by 'operation-id-required-prefix'
              // but good to check here to prevent errors later.
              return [];
            }
            const techProjectPrefix = prefixMatch[0];
            const operationIdCore = operationId.substring(techProjectPrefix.length);

            // Normalize path: remove potential /api/vX prefix and leading/trailing slashes
            apiPath = apiPath.replace(/^\/api\/v\d+\//, '/').replace(/^\/+|\/+$/g, '');
            const segments = apiPath.split('/').filter(s => s); // Filter out empty segments

            let expectedCore = '';
            const params = segments.filter(s => s.startsWith('{') && s.endsWith('}'));
            const nonParamSegments = segments.filter(s => !s.startsWith('{') && !s.endsWith('}'));

            if (nonParamSegments.length === 0 && params.length === 0 && apiPath === '') { // Root path if any
                // Define behavior for root path if necessary, e.g., GET /
                // For now, assuming it's not covered by the provided rules explicitly
            } else if (nonParamSegments.length === 1) {
              const resource = toScreamingSnakeCase(nonParamSegments[0]);
              if (httpMethod === 'get') {
                if (params.length === 0) { // e.g., GET /orders or /order-brands
                  if (operationIdCore.endsWith('_GET_ALL')) {
                    expectedCore = `${resource}_GET_ALL`;
                  } else if (operationIdCore.endsWith('_LIST')) {
                    expectedCore = `${resource}_LIST`;
                  } else {
                     errors.push({ message: `For GET /${nonParamSegments[0]}, operationId core "${operationIdCore}" should end with _GET_ALL or _LIST.` });
                  }
                } else if (params.length === 1) { // e.g., GET /orders/{id}
                  expectedCore = `${resource}_GET_BY_ID`;
                }
              } else if (httpMethod === 'post' && params.length === 0) { // e.g., POST /orders
                expectedCore = `${resource}_CREATE`;
              } else if (httpMethod === 'delete' && params.length === 1) { // e.g., DELETE /orders/{id}
                 expectedCore = `${resource}_DELETE`;
              } else if (httpMethod === 'patch' && params.length === 1) { // e.g., PATCH /orders/{id}
                 expectedCore = `${resource}_UPDATE`;
              }
            } else if (nonParamSegments.length === 2) {
              // Case 1: Parent resource and sub-resource (e.g. /orders/{id}/states)
              // Case 2: Resource and action (e.g. /students/send-sms or /cart/checkout)
              const parentResource = toScreamingSnakeCase(nonParamSegments[0]);
              const secondSegment = toScreamingSnakeCase(nonParamSegments[1]);

              if (params.length === 1 && segments[1].startsWith('{') && segments[1].endsWith('}')) {
                // Path like /resource/{id}/subresource_or_action
                // e.g., /orders/{id}/states or /orders/{id}/lines
                const subResourceOrAction = secondSegment;
                if (httpMethod === 'get') {
                    // Pattern: RESOURCE_GET_ALL_SUBRESOURCE or RESOURCE_LIST_SUBRESOURCE
                    if (operationIdCore.endsWith(`_GET_ALL_${subResourceOrAction}`)) {
                        expectedCore = `${parentResource}_GET_ALL_${subResourceOrAction}`;
                    } else if (operationIdCore.endsWith(`_LIST_${subResourceOrAction}`)) {
                        expectedCore = `${parentResource}_LIST_${subResourceOrAction}`;
                    } else {
                         errors.push({ message: `For GET /${nonParamSegments[0]}/{id}/${nonParamSegments[1]}, operationId core "${operationIdCore}" should be like ${parentResource}_GET_ALL_${subResourceOrAction} or ${parentResource}_LIST_${subResourceOrAction}.` });
                    }
                } else if (httpMethod === 'post') {
                    // Pattern: RESOURCE_CREATE_RESOURCE (sub-resource)
                    expectedCore = `${parentResource}_CREATE_${subResourceOrAction}`;
                } else if (httpMethod === 'patch') {
                    // Pattern: RESOURCE_UPDATE_RESOURCE (sub-resource)
                    expectedCore = `${parentResource}_UPDATE_${subResourceOrAction}`;
                }
              } else if (params.length === 0 && segments.length === 2) {
                // Path like /resource/action , e.g. /students/send-sms, /cart/checkout
                const resource = parentResource;
                const operation = secondSegment;
                // Pattern: RESOURCE_OPERATION
                if (httpMethod === 'get' || httpMethod === 'post') { // As per examples
                    expectedCore = `${resource}_${operation}`;
                }
              }
            } else if (nonParamSegments.length === 2 && params.length === 2) {
                // Path like /resource/{id}/sub-resource/{subId}, e.g. /orders/{id}/lines/{lineId}
                const parentResource = toScreamingSnakeCase(nonParamSegments[0]);
                const subResourceSegment = nonParamSegments[1]; // e.g., "lines"

                if (httpMethod === 'get') {
                    // Special case from table: P_TP_ORDERS_GET_LINE_BY_ID
                    // This implies singularization of subResourceSegment for the _BY_ID part.
                    const singularSubResource = singularize(subResourceSegment);
                    expectedCore = `${parentResource}_GET_${singularSubResource}_BY_ID`;
                }
            }
            // Add more conditions for other path structures if needed based on Table 5 patterns

            if (expectedCore && operationIdCore !== expectedCore) {
              errors.push({
                message: `Operation ID core "${operationIdCore}" does not match expected structure "${expectedCore}" for method ${httpMethod.toUpperCase()} and path /${apiPath}. Full operationId: "${operationId}" vs expected prefix + "${expectedCore}"`,
                path: [...context.path, 'operationId'],
              });
            } else if (!expectedCore && errors.length === 0 && nonParamSegments.length > 0) {
                // If no expectedCore was set, it means the path/method combo wasn't covered by specific rules above.
                // This could be a rule gap or an intentionally unhandled case.
                // You might want to log this or add a generic check if all ops must match some pattern.
                // For now, we only error if a specific pattern was expected and not met.
            }


            return errors;
          },
        },
      },
    },
  },
  // It's good practice to also include the built-in rule for unique operationIds
  // This requires configuring Redocly to use both your plugin and this prebuilt rule.
  // This part is more about .redocly.yaml configuration.
  // However, a plugin can also re-export prebuilt rules if needed, though less common for this specific one.
};