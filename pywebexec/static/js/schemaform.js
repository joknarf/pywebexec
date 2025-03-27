function adjustInputWidth(input) {
  if (!input.getAttribute('size')) {
    input.setAttribute('size', 9);
  }
  input.style.width = 'auto';
  if (input.type === 'number') {
    delta = 30;
  } else {
    delta = 3;
  }
  if (input.scrollWidth > 0) {
    input.style.width = `${input.scrollWidth + delta}px`;
  } else {
    input.style.width = `${input.value.length * 10 + 20}px`;
  }
  
}

function formInputHandle() {
  schemaForm.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    val = input.placeholder;
    if (val) {
      size = Math.max(val.length, 2)
      if (input.type== 'number') {
        size += 2;
      }
    } else {
      size = 12;
    }
    if (input.value) {
      size = 2;
    }
    input.setAttribute('size', size);
    setTimeout(() => adjustInputWidth(input), 1);
  });
}

function extractKeysAndPlaceholders(obj, formkeys, formoptions, prefix = '') {
    let result = [];
  
    for (let key in obj.properties) {
      k = prefix ? `${prefix}.${key}` : key;
      if (formoptions[k]) {
        continue;
      }
      if (obj.properties[key].type === 'object' && obj.properties[key].properties) {
        result = result.concat(extractKeysAndPlaceholders(obj.properties[key], formkeys, formoptions, k));
      } else {
        if (formkeys[k]) {
          foptions = formkeys[k];
        } else {
          foptions = {};
        }
        result.push({
          key: k,
          placeholder: obj.properties[key].example || null,
          ... foptions
        });
      }
    }
    return result;
}


// Convert objects to JSON strings where schema type is object without properties
function convertObjectsToJsonStrings(obj, schema, prefix = '') {
  // Helper function to get schema type and check for properties
  function getSchemaTypeForKey(schema, keyPath) {
    const keys = keyPath.split('.');
    let current = schema.properties;
    for (const key of keys) {
      if (!current || !current[key]) return null;
      current = current[key];
    }
    return current;
  }

  for (const key in obj) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    const schemaType = getSchemaTypeForKey(schema, keyPath);
    
    if (schemaType && schemaType.type === 'object' && !schemaType.properties) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        obj[key] = JSON.stringify(obj[key], null, 2);
      }
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      convertObjectsToJsonStrings(obj[key], schema, keyPath);
    }
  }
}


function convertTextareaToArray(values, formDesc, schema) {
  // Helper function to get schema type for a key path
  function getSchemaType(schema, keyPath) {
    const keys = keyPath.split('.');
    let current = schema.properties;
    for (const key of keys) {
      if (!current || !current[key] || !current[key].properties) {
        return current?.[key]?.type;
      }
      current = current[key].properties;
    }
    return null;
  }

  // Convert textarea values to arrays if schema type matches
  for (let i = 0; i < formDesc.length; i++) {
    if (formDesc[i].type == 'textarea') {
      const schemaType = getSchemaType(schema, formDesc[i].key);
      if (schemaType === 'array') {
        const keys = formDesc[i].key.split('.');
        let obj = values;
        for (let j = 0; j < keys.length - 1; j++) {
          obj = obj[keys[j]];
        }
        const lastKey = keys[keys.length - 1];
        const val = obj[lastKey];
        if (val) {
          obj[lastKey] = val.trim().split(/[\s\r,]+/).filter(x => x);
        } else {
          delete obj[lastKey];
        }
      }
    }
  }
  return values;
}

function validateSchemaForm(form, formDesc, schema, values, schemaName) {
  schemaValues[schemaName] = convertTextareaToArray(values, formDesc, schema);
  localStorage.setItem('schemaValues', JSON.stringify(schemaValues));
  env = JSV.createEnvironment();
  report = env.validate(values, schema);
  errors = report.errors;
  err = form.querySelector('.alert');
  if (errors.length > 0) {
    err.innerText = errors[0].uri.split('#')[1].slice(1).replaceAll('/', '.') + ': ' + errors[0].message + ': ' + errors[0].details;
    err.style.display = 'block';
    return false;
  }
  err.style.display = 'none';
  return true;
}

function createSchemaForm($form, schema, onSubmit, schemaName) {
  schema_options = undefined;
  schema_params_options = undefined;
  if (schema && schema.schema_options) {
    schema_options = schema.schema_options;
  }
  if (schema && schema.properties && schema.properties.params && schema.properties.params.schema_options) {
    schema_params_options = schema.properties.params.schema_options;
  }

  formkeys = {};
  formoptions = {};
  if (schema_options) {
    formkeys = schema_options.form || {}
    formoptions = schema_options.formoptions || {};
  } else if (schema_params_options) {
    let fkeys = schema_params_options.form || {};
    let foptions = schema_params_options.formoptions || {};
    for (let key in fkeys) {
      formkeys[`params.${key}`] = fkeys[key];
    }
    for (let key in foptions) {
      formoptions[`params.${key}`] = foptions[key];
    }
  }
  formDesc = extractKeysAndPlaceholders(schema, formkeys, formoptions);
  if (schemaValues[schemaName]) {
    value = schemaValues[schemaName];
    // convert array for textarea formDesc type to string separated by newlines
    // if in formDesc a key has type textarea, convert the value to string separated by newlines
    // formDesc=[{key: 'db.sid', type: 'textarea'}]
    // value = {db: {sid: ['AA', 'BB']}}
    // convert to
    // value = {db: {sid: 'AA\nBB'}}
    for (let i = 0; i < formDesc.length; i++) {
      if (formDesc[i].type === 'textarea') {
        const keys = formDesc[i].key.split('.');
        let obj = value;
        for (let j = 0; j < keys.length - 1; j++) {
          if (!(keys[j] in obj)) obj[keys[j]] = {};
          obj = obj[keys[j]];
        }
        const lastKey = keys[keys.length - 1];
        const val = obj[lastKey];
        if (val && Array.isArray(val)) {
          obj[lastKey] = val.join('\n');
        }
      }
    }
    convertObjectsToJsonStrings(value, schema);
  } else {
    value = {};
  }
  // recreate form to remove event listeners
  $form.off();
  $form.empty();
  $form.html('');
  $newform = $form.clone();
  $form.replaceWith($newform);
  $form = $newform;
  schemaForm = $form[0];
  if (onSubmit != null) {
    if (schema_options && schema_options.batch_param) {
      schema.properties[schema_options.batch_param].required = true;
      if (!schema.properties.parallel) {
        schema.properties['parallel'] = {
          type: 'integer',
          default: 1,
          minimum: 1,
          maximum: 100,
          required: true,
          description: "nb parallel jobs"
        };
        schema.properties['delay'] = {
          type: 'integer',
          default: 10,
          minimum: 0,
          maximum: 600,
          required: true,
          description: "initial delay in s between jobs"
        };
        formDesc.push({
          key: 'parallel',
        });
        formDesc.push({
          key: 'delay',
        });
      }
      for (i = 0; i < formDesc.length; i++) {
        if (formDesc[i].key == schema_options.batch_param) {
          formDesc[i].type = 'textarea';
          formDesc[i].required = true;
        }
        if (formDesc[i].key == 'parallel') {
          formDesc[i].type = 'range';
          formDesc[i].indicator = true;
        }
        if (formDesc[i].key == 'delay') {
          formDesc[i].type = 'range';
          formDesc[i].indicator = true;
        }
      }
    }
    if (Object.keys(formoptions).length) {
      items = [];
      for (let key in formoptions) {
        items.push({
          key: key,
          ... formoptions[key],
        });
      }
      formDesc.push({
        type: 'fieldset',
        title: 'Options',
        fieldHtmlClass: 'fieldsetoptions',
        expandable: true,
        items: items,
      });
    }
    formDesc.push({
      type: 'actions',
      items: [
        {
          type: 'submit',
          title: 'Run',
          id: 'run-form',
        },
        {
          type: 'button',
          title: 'Reset',
          id: 'reset-form',
          onClick: function (evt) {
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
            schemaValues[schemaName] = {};
            createSchemaForm($form, schema, onSubmit, schemaName);
          },
        },
      ],
    });
  } else {
    if (schema_params_options && schema_params_options.batch_param) {
      schema.properties.params.properties[schema_params_options.batch_param].required = true;
      for (i = 0; i < formDesc.length; i++) {
        if (formDesc[i].key == 'params.' + schema_params_options.batch_param) {
          formDesc[i].type = 'textarea';
          formDesc[i].required = true;
        }
        if (formDesc[i].key == 'parallel') {
          formDesc[i].type = 'range';
          formDesc[i].indicator = true;
        }
        if (formDesc[i].key == 'delay') {
          formDesc[i].type = 'range';
          formDesc[i].indicator = true;
        }
      }
    }
    if (formoptions) {
      items = [];
      for (let key in formoptions) {
        items.push({
          key: key,
          ... formoptions[key],
        });
      }
      formDesc.push({
        type: 'fieldset',
        title: 'Options',
        fieldHtmlClass: 'fieldsetoptions',
        expandable: true,
        items: items,
      });
    }
  }
  // schemaForm.classList.add('form-inline');
  jsform = $form.jsonForm({
    schema: schema,
    onSubmit: function (errors, values) {
      if (! validateSchemaForm(event.target, formDesc, schema, values, schemaName)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        return false;
      }
      onSubmit(errors, values);
    },
    form: formDesc,
    value: value,
    validate: false,
    // params: {
    //     fieldHtmlClass: "input-small",
    // }
  });
  schemaForm.firstChild.classList.add('form-inline');
  err = document.createElement('div');
  err.classList.add('alert');
  err.style.display = 'none';
  schemaForm.appendChild(err);
  validateSchemaForm(schemaForm, formDesc, schema, jsform.root.getFormValues(), schemaName);
  schemaForm.querySelectorAll('textarea').forEach(txt => {
    txt.style.height = "0";  
    setTimeout(() => adjustTxtHeight(txt), 1);
    txt.setAttribute("spellcheck", "false");
    txt.addEventListener("input", () => adjustTxtHeight(txt));
  });
  schemaForm.addEventListener('input', (e) => {
    validateSchemaForm(schemaForm, formDesc, schema, jsform.root.getFormValues(), schemaName);
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
      adjustInputWidth(e.target);
    }
  });
  schemaForm.addEventListener('mouseup', (e) => {
    // save form values when clicking on array buttons
    setTimeout(() => validateSchemaForm(schemaForm, formDesc, schema, jsform.root.getFormValues(), schemaName), 1);
  });
  divopt = schemaForm.querySelector("fieldset.expandable > div");
  formInputHandle();
  return jsform;
}
function adjustTxtHeight(txt) {
  if (txt.value.includes('\n')) {
    delta = 2;
  } else {
    delta = 0;
  }
  txt.style.height = "0";
  txt.style.height = `${txt.scrollHeight+delta}px`;
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
// let inputHandlers = [];
let schemaValues = JSON.parse(localStorage.getItem('schemaValues')) || {};
