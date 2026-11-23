const classNameRead =
  ':matches(MemberExpression[object.computed=false][object.property.name="constructor"], MemberExpression[object.meta.name="new"], MemberExpression[object.name=/^[A-Z]/])[computed=false][property.name="name"]';

const errorNameMessage =
  'Set the error class name as a string literal, e.g. this.name = "KeyLimitError". The build minifies class names, so err.type in production logs would be a short name like "d". See docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu in the GatoJS repo.';

// WHY: esquery 1.7 reads :has(> A > B) as "the :has subject is A and has a child B", not "a child A has a child B",
// so every step down the tree is a separate :has(> …).
const childPath = (...steps) =>
  steps.reduceRight((inner, step) => `${step}:has(> ${inner})`);

const ownNameField = childPath(
  "ClassBody",
  'PropertyDefinition[computed=false][key.type="Identifier"][key.name="name"][value]',
);

const ownNameAssignment = childPath(
  "ClassBody",
  'MethodDefinition[kind="constructor"]',
  "FunctionExpression",
  "BlockStatement",
  "ExpressionStatement",
  'AssignmentExpression[left.object.type="ThisExpression"][left.computed=false][left.property.type="Identifier"][left.property.name="name"]',
);

export const errorNameFromClassName = [
  {
    selector: `AssignmentExpression[left.object.type="ThisExpression"][left.computed=false][left.property.name="name"] > ${classNameRead}.right`,
    message: errorNameMessage,
  },
  {
    selector: `PropertyDefinition[computed=false][key.name="name"] > ${classNameRead}.value`,
    message: errorNameMessage,
  },
];

export const unnamedErrorClass = {
  selector: `:matches(ClassDeclaration, ClassExpression)[superClass.name="Error"]:not(:has(> ${ownNameField})):not(:has(> ${ownNameAssignment}))`,
  message:
    'A class that extends Error directly does not set its own name. Set it as a string literal in a class field (name = "KeyLimitError") or in the constructor (this.name = "KeyLimitError"). Without it, err.type in production logs is a minified class name like "d". See docs/07b-logi-naglowki-healthcheck.md#logger-typ-bledu in the GatoJS repo.',
};
