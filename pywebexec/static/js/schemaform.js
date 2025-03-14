function adjustInputWidth(input) {
    input.style.width = 'auto';
    input.style.width = `${input.scrollWidth + 3}px`;
}

function formInputHandle() {
    schemaForm.querySelectorAll('input[type="text"]').forEach(input => {
        if (! inputHandlers.includes(input)) {
            input.setAttribute('size', '12');
            input.addEventListener('input', () => adjustInputWidth(input));
            inputHandlers.push(input);
        }
    });
}

function extractKeysAndPlaceholders(obj, prefix = '') {
    let result = [];
  
    for (let key in obj.properties) {
      if (obj.properties[key].type === 'object' && obj.properties[key].properties) {
        // Si la propriété est un objet, appeler récursivement
        result = result.concat(extractKeysAndPlaceholders(obj.properties[key], prefix ? `${prefix}.${key}` : key));
      } else {
        // Sinon, ajouter au résultat
        result.push({
          key: prefix ? `${prefix}.${key}` : key,
          placeholder: obj.properties[key].example || null
        });
      }
    }
    return result;
}

function createSchemaForm(form, schema, onSubmit) {
    formDesc = extractKeysAndPlaceholders(schema);
    schemaForm = form[0];
    if (onSubmit != null) {
        formDesc.push({
            type: 'submit',
            title: 'Run',
        });
    }
    form[0].classList.add('form-inline');
    jsform = form.jsonForm({
        schema: schema,
        onSubmit: onSubmit,
        form: formDesc,
        // params: {
        //     fieldHtmlClass: "input-small",
        // }
    });
    form[0].firstChild.classList.add('form-inline');
    form[0].querySelectorAll('._jsonform-array-addmore').forEach(btn => {
        btn.addEventListener('click', formInputHandle);
    });
    formInputHandle();

    form[0].querySelectorAll('textarea').forEach(txt => {
      txt.style.height = "0";
      txt.style.height = txt.scrollHeight + "px";
      txt.addEventListener("input", (e) => {
        e.target.style.height = "0";
        e.target.style.height = (e.target.scrollHeight+2) + "px";
      });
    });
    
    return jsform;
}

async function getSwaggerSpec() {
    const response = await fetch('/swagger.yaml');
    if (!response.ok) {
      return null;
    }
    const yamlText = await response.text();
    // Changed from yaml.parse to jsyaml.load because js-yaml exposes jsyaml
    return jsyaml.load(yamlText);
}
  
async function getPostParametersSchema() {
    const swaggerSpec = await getSwaggerSpec();
    const result = {};
    for (const path in swaggerSpec.paths) {
      const pathItem = swaggerSpec.paths[path];
      if (pathItem.post) {
        const postDef = pathItem.post;
        // Look for a parameter in the body with a schema property
        if (postDef.parameters && Array.isArray(postDef.parameters)) {
          const bodyParam = postDef.parameters.find(p => p.in === 'body' && p.schema);
          result[path] = bodyParam ? bodyParam.schema : null;
        } else {
          result[path] = null;
        }
      }
    }
    return result;
}

let schemaForm;
let inputHandlers = [];


