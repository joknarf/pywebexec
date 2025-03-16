let ui;
let swaggerSchemas = {};
function addFormInputListener(textArea, jsform){
  return function (event) {
    jsonString = JSON.stringify(jsform.root.getFormValues(), null, 2);
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
        if (node.classList && (node.classList.contains("highlight-code") ||
          node.classList.contains("body-param__text"))) {
          // Retrieve the data-path attribute from the first opblock-summary-path element
          const routePath = $(node).closest('.opblock').find('.opblock-summary-path').first().attr('data-path');
          const routePathId = `schemaForm${routePath.replaceAll("/", "_")}`;
          const prevForm = node.parentNode.querySelector(`#${routePathId}`)
          if (prevForm) {
            prevForm.remove();
          }
          if (node.classList.contains("body-param__text")) {
            node.addEventListener("input", (e) => {
              e.target.style.height = "0"
              e.target.style.height = e.target.scrollHeight + "px";
            });
            node.style.height = "0"
            node.style.height = node.scrollHeight + "px";
            const form = document.createElement("form");
            form.id = routePathId;
            form.classList.add("schema-form");
            jsform = createSchemaForm($(form), swaggerSchemas[routePath], null);
            // form.addEventListener("input", formInput(node, jsform)); 
            form.addEventListener("input", addFormInputListener(node, jsform));
            node.parentNode.insertBefore(form, node.nextSibling);
            item1 = form.querySelector("input, select, textarea");
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

