import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

type AsyncComponent = (props: unknown) => Promise<ReactNode>;

function isAsyncComponent(type: unknown): type is AsyncComponent {
  return (
    typeof type === "function" && type.constructor.name === "AsyncFunction"
  );
}

export async function resolveServerTree(
  node: ReactNode | Promise<ReactNode>,
): Promise<ReactNode> {
  const awaited = await node;
  if (Array.isArray(awaited)) {
    return Promise.all(
      awaited.map((child: ReactNode) => resolveServerTree(child)),
    );
  }
  if (!isValidElement(awaited)) {
    return awaited;
  }
  const element = awaited as ReactElement<{ children?: ReactNode }>;
  if (isAsyncComponent(element.type)) {
    return resolveServerTree(element.type(element.props));
  }
  if (element.props.children === undefined) {
    return element;
  }
  return cloneElement(
    element,
    undefined,
    await resolveServerTree(element.props.children),
  );
}
