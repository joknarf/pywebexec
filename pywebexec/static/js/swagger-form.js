let ui;
let swaggerSchemas = {};

window.onload = function() {
  ui = SwaggerUIBundle({
    url: "/swagger.yaml",
    dom_id: "#swagger-ui",
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    requestInterceptor: (req) => {
      // Select the updated textarea value
      if (! req.method) {
        return req;
      }
      if (req.method === "GET") {
        return req;
      }
      datapath = req.url.split("/").slice(3).join("_");

      method = `${req.method}`.toLowerCase();
      idsearch = `${method}_${datapath}`;      
      // `[id^="operations-"][id$="-post_commands_remote_yum"] .body-param__text` 
      const textarea = document.querySelector(
        `[id^="operations-"][id$="-${idsearch}"] .body-param__text`
      );
      if (textarea) {
        try {
          req.body = textarea.value;
        } catch (e) {
          console.error("Error parsing JSON from textarea:", e);
        }
      }
      return req;
    }
  });
  getPostParametersSchema().then(schemas => {
    swaggerSchemas = schemas;
  });  
  // Extend Swagger UI: When a div with class "parameters-col_description" appears,
  // append a custom form element.
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE &&
            node.classList.contains("body-param__text")) {
          // Use jQuery to retrieve the innerText of the previous element with class "opblock-summary-method"
          //let methodText = $(node).closest('.opblock').find('.opblock-summary-method').first().text();

          // Retrieve the data-path attribute from the first opblock-summary-path element
          let routePath = $(node).closest('.opblock').find('.opblock-summary-path').first().attr('data-path');
          
          if (!node.querySelector(".custom-form-element")) {
            const form = document.createElement("form");
            form.id = "schemaForm";
            jsform = createSchemaForm($(form), swaggerSchemas[routePath], null);
            form.addEventListener("input", () => {
              node.value = JSON.stringify(jsform.root.getFormValues(), null, 2);
            });
            node.parentNode.appendChild(form);
          }
        }
      });
    });
  });
  observer.observe(document.getElementById("swagger-ui"), {childList: true, subtree: true});
};

