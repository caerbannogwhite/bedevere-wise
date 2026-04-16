import { FileTreeNode } from "../../data/FileTreeTypes";

export interface FileTreeCallbacks {
  onNodeClick: (node: FileTreeNode) => void;
  onNodeExpand: (node: FileTreeNode) => void;
  onNodeContextMenu: (node: FileTreeNode, e: MouseEvent) => void;
  onAliasChange: (node: FileTreeNode, alias: string) => void;
}

const FILE_ICONS: Record<string, string> = {
  folder: "📁",
  csv: "📄",
  tsv: "📄",
  json: "{}",
  parquet: "⬡",
  xlsx: "📊",
  xls: "📊",
  sas7bdat: "📈",
  xpt: "📈",
  sav: "📈",
  dta: "📈",
  sheet: "📋",
};

export class FileTreeRenderer {
  private container: HTMLElement;
  private callbacks: FileTreeCallbacks;

  constructor(container: HTMLElement, callbacks: FileTreeCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  public render(roots: FileTreeNode[]): void {
    this.container.innerHTML = "";
    for (const root of roots) {
      this.container.appendChild(this.renderNode(root, 0));
    }
  }

  public updateNode(nodeId: string, updates: Partial<FileTreeNode>): void {
    const el = this.container.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`) as HTMLElement;
    if (!el) return;

    if (updates.isImported !== undefined) {
      el.classList.toggle("file-tree__node--imported", updates.isImported);
    }
    if (updates.isExpanded !== undefined) {
      el.classList.toggle("file-tree__node--expanded", updates.isExpanded);
      const chevron = el.querySelector(".file-tree__chevron") as HTMLElement;
      if (chevron) {
        chevron.classList.toggle("file-tree__chevron--expanded", updates.isExpanded);
      }
      const children = el.querySelector(".file-tree__children") as HTMLElement;
      if (children) {
        children.style.display = updates.isExpanded ? "block" : "none";
      }
    }
    if (updates.alias !== undefined) {
      const nameEl = el.querySelector(".file-tree__name") as HTMLElement;
      if (nameEl) {
        nameEl.textContent = updates.alias || updates.name || "";
        if (updates.alias) {
          nameEl.title = `${updates.name} → ${updates.alias}`;
        }
      }
    }
  }

  public appendChildren(nodeId: string, children: FileTreeNode[], depth: number): void {
    const el = this.container.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`) as HTMLElement;
    if (!el) return;

    let childrenContainer = el.querySelector(".file-tree__children") as HTMLElement;
    if (!childrenContainer) {
      childrenContainer = document.createElement("div");
      childrenContainer.className = "file-tree__children";
      el.appendChild(childrenContainer);
    }

    childrenContainer.innerHTML = "";
    for (const child of children) {
      childrenContainer.appendChild(this.renderNode(child, depth + 1));
    }
    childrenContainer.style.display = "block";
  }

  private renderNode(node: FileTreeNode, depth: number): HTMLElement {
    const el = document.createElement("div");
    el.className = "file-tree__node";
    el.dataset.nodeId = node.id;

    if (node.isImported) el.classList.add("file-tree__node--imported");
    if (node.isUnavailable) el.classList.add("file-tree__node--unavailable");
    if (node.isExpanded) el.classList.add("file-tree__node--expanded");

    // Row
    const row = document.createElement("div");
    row.className = "file-tree__row";
    row.style.paddingLeft = `${depth * 16 + 8}px`;

    // Chevron (for expandable nodes): folders always expand; Excel workbooks
    // (kind === "file") expand to list their sheets. Sheet-kind children
    // inherit xlsx/xls fileType but are leaves — no chevron.
    const isExcelWorkbook =
      node.kind === "file" && (node.fileType === "xlsx" || node.fileType === "xls");
    const hasChildren = node.kind === "folder" || isExcelWorkbook;
    if (hasChildren) {
      const chevron = document.createElement("span");
      chevron.className = "file-tree__chevron";
      chevron.textContent = "▶";
      if (node.isExpanded) chevron.classList.add("file-tree__chevron--expanded");
      chevron.addEventListener("click", (e) => {
        e.stopPropagation();
        node.isExpanded = !node.isExpanded;
        this.callbacks.onNodeExpand(node);
        this.updateNode(node.id, { isExpanded: node.isExpanded });
      });
      row.appendChild(chevron);
    } else {
      const spacer = document.createElement("span");
      spacer.className = "file-tree__chevron-spacer";
      row.appendChild(spacer);
    }

    // Icon
    const icon = document.createElement("span");
    icon.className = "file-tree__icon";
    const iconKey = node.kind === "folder" ? "folder" : (node.kind === "sheet" ? "sheet" : (node.fileType || "csv"));
    icon.textContent = FILE_ICONS[iconKey] || "📄";
    row.appendChild(icon);

    // Name
    const name = document.createElement("span");
    name.className = "file-tree__name";
    name.textContent = node.alias || node.name;
    if (node.alias) {
      name.title = `${node.name} → ${node.alias}`;
    }
    if (node.isUnavailable) {
      name.title = `${node.name} — format not available (extension not loaded)`;
    }
    row.appendChild(name);

    // Click handler
    if (!node.isUnavailable) {
      row.addEventListener("click", () => this.callbacks.onNodeClick(node));
    }

    // Context menu
    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.callbacks.onNodeContextMenu(node, e);
    });

    // Double-click to rename
    name.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.startInlineEdit(name, node);
    });

    el.appendChild(row);

    // Children container
    if (node.children && node.children.length > 0) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "file-tree__children";
      childrenContainer.style.display = node.isExpanded ? "block" : "none";

      for (const child of node.children) {
        childrenContainer.appendChild(this.renderNode(child, depth + 1));
      }
      el.appendChild(childrenContainer);
    }

    return el;
  }

  private startInlineEdit(nameEl: HTMLElement, node: FileTreeNode): void {
    const input = document.createElement("input");
    input.className = "file-tree__edit-input";
    input.value = node.alias || node.name;
    input.select();

    const originalText = nameEl.textContent || "";
    nameEl.textContent = "";
    nameEl.appendChild(input);
    input.focus();

    const commit = () => {
      const newAlias = input.value.trim();
      input.remove();
      nameEl.textContent = newAlias || originalText;
      if (newAlias && newAlias !== node.name) {
        node.alias = newAlias;
        this.callbacks.onAliasChange(node, newAlias);
      } else {
        node.alias = undefined;
        nameEl.textContent = originalText;
      }
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); input.remove(); nameEl.textContent = originalText; }
      e.stopPropagation(); // Don't let spreadsheet handle keys
    });
    input.addEventListener("blur", commit);
  }
}
