let ui;
let swaggerSchemas = {};

function addFormInputListener(textArea, jsform){
  return function (event) {
    jsonString = JSON.stringify(convertTextareaToArray(jsform.root.getFormValues(), jsform.formDesc.form, jsform.formDesc.schema), null, 2);
    textArea.value = jsonString;

    // Find the React fiber node
    const key = Object.keys(textArea).find(k => k.startsWith('__reactFiber$'));
    const fiber = textArea[key];

    if (fiber && fiber.memoizedProps?.onChange) {
      // Create a minimal synthetic event
      const syntheticEvent = {
        target: textArea,
        currentTarget: textArea,
        type: 'change',
        preventDefault: () => {},
        stopPropagation: () => {}
      };
      
      // Call React's onChange directly
      fiber.memoizedProps.onChange(syntheticEvent);
    }
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  };
}

async function getPostParametersSchema() {
  const swaggerSpec = await getSwaggerSpec();
  const result = {};
  for (const path in swaggerSpec.paths) {
    const pathItem = swaggerSpec.paths[path];
    if (pathItem.post) {
      const postDef = pathItem.post;
      // Look for requestBody with JSON schema in OpenAPI 3.0
      if (postDef.requestBody && postDef.requestBody.content && postDef.requestBody.content['application/json']) {
        result[path] = postDef.requestBody.content['application/json'].schema;
      } else {
        result[path] = null;
      }
    }
  }
  return result;
}
function adjustTxtHeight2(paramtext) {
  paramtext.style.height = "0";
  paramtext.style.height = `${paramtext.scrollHeight+2}px`;
}

window.onload = function() {
  ui = SwaggerUIBundle({
    url: "/swagger.yaml",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    // requestInterceptor: (req) => {
    //   // Select the updated textarea value
    //   if (! req.method) {
    //     return req;
    //   }
    //   if (req.method === "GET") {
    //     return req;
    //   }
    //   datapath = req.url.split("/").slice(3).join("_");

    //   method = `${req.method}`.toLowerCase();
    //   idsearch = `${method}_${datapath}`;      
    //   // `[id^="operations-"][id$="-post_commands_remote_yum"] .body-param__text` 
    //   const textarea = document.querySelector(
    //     `[id^="operations-"][id$="-${idsearch}"] .body-param__text`
    //   );
    //   if (textarea) {
    //     try {
    //       req.body = textarea.value;
    //     } catch (e) {
    //       console.error("Error parsing JSON from textarea:", e);
    //     }
    //   }
    //   return req;
    // }
  });
  getPostParametersSchema().then(schemas => {
    swaggerSchemas = schemas;
  });  
  // Extend Swagger UI: When a div with class "parameters-col_description" appears,
  // append a custom form element.
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const paramtext = node.querySelector(".body-param__text");
          if (paramtext) {
            // Retrieve the data-path attribute from the first opblock-summary-path element
            const routePath = $(node).closest('.opblock').find('.opblock-summary-path').first().attr('data-path');
            const routePathId = `schemaForm${routePath.replaceAll("/", "_")}`;
            const prevForm = paramtext.parentNode.querySelector(`#${routePathId}`)
            if (prevForm) {
              prevForm.remove();
            }
            paramtext.addEventListener("input", () => adjustTxtHeight2(paramtext));
            setTimeout(() => adjustTxtHeight2(paramtext), 100);
            const form = document.createElement("form");
            form.id = routePathId;
            form.classList.add("schema-form");
            paramtext.parentNode.insertBefore(form, paramtext.nextSibling);
            jsform = createSchemaForm($(form), swaggerSchemas[routePath], null, routePath);
            newForm = jsform.root.ownerTree.domRoot;
            setTimeout(() => addFormInputListener(paramtext, jsform)(), 100);
            newForm.addEventListener("input", addFormInputListener(paramtext, jsform));
            item1 = newForm.querySelector("input, select, textarea");
            if (item1) {
              item1.focus();
            }
          }
        }
      });
    });
  });
  observer.observe(document.getElementById("swagger-ui"), {childList: true, subtree: true});
};

