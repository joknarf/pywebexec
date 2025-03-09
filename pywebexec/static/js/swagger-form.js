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
  });
  console.log("Swagger UI:", ui);
  getPostParametersSchema().then(schemas => {
    swaggerSchemas = schemas;
  });
  // console.log("Swagger Schemas:", swaggerSchemas);
  
  // Extend Swagger UI: When a div with class "parameters-col_description" appears,
  // append a custom form element.
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE &&
            node.classList.contains("body-param__text")) {
          // Use jQuery to retrieve the innerText of the previous element with class "opblock-summary-method"
          let methodText = $(node).closest('.opblock').find('.opblock-summary-method').first().text();
          console.log("Method text:", methodText);

          // Retrieve the data-path attribute from the first opblock-summary-path element
          let routePath = $(node).closest('.opblock').find('.opblock-summary-path').first().attr('data-path');
          console.log("Route path:", routePath);
          
          if (!node.querySelector(".custom-form-element")) {
            const form = document.createElement("form");
            form.id = "schemaForm";
            jsform = createSchemaForm($(form), swaggerSchemas[routePath], null);
            form.addEventListener("input", () => {
              node.value = JSON.stringify(jsform.root.getFormValues(), null, 2);
              node.dispatchEvent(new Event("input"));
            });
            node.parentNode.appendChild(form);
          }
        }
      });
    });
  });
  observer.observe(document.getElementById("swagger-ui"), {childList: true, subtree: true});
};

