import { describe, expect, it } from "vitest";
import { Badge, Button, Container, EmptyState, Grid, Stack, VisuallyHidden } from "./index";

describe("@platform/ui primitives", () => {
  it("renders existing components: Container, Badge, EmptyState", () => {
    const container = Container({ children: "Content" });
    expect(container.type).toBe("div");
    expect(container.props.style?.width).toBe("min(1180px, calc(100% - 48px))");
    expect(container.props.children).toBe("Content");

    const badge = Badge({ children: "Active", tone: "success" });
    expect(badge.type).toBe("span");
    expect(badge.props.style?.background).toBe("#E9F3EA");
    expect(badge.props.style?.color).toBe("#2C603A");
    expect(badge.props.children).toBe("Active");

    const empty = EmptyState({ title: "Vazio", description: "Sem itens" });
    expect(empty.type).toBe("div");
    expect(empty.props.children[0].props.children).toBe("Vazio");
    expect(empty.props.children[1].props.children).toBe("Sem itens");
  });

  describe("Button", () => {
    it("renders as <button> when href is not provided", () => {
      const button = Button({ children: "Clique aqui" });
      expect(button.type).toBe("button");
      expect(button.props.type).toBe("button");
      expect(button.props.children).toBe("Clique aqui");
      expect(button.props.style?.background).toBe("#214f3c");
      expect(button.props.style?.color).toBe("#ffffff");
      expect(button.props.style?.borderRadius).toBe(8);
      expect(button.props.style?.outlineOffset).toBe(2);
    });

    it("renders as <a> when href is provided", () => {
      const link = Button({ children: "Agendar", href: "/agendar" });
      expect(link.type).toBe("a");
      expect(link.props.href).toBe("/agendar");
      expect(link.props.children).toBe("Agendar");
    });

    it("supports all variants", () => {
      const primary = Button({ children: "P", variant: "primary" });
      expect(primary.props.style?.background).toBe("#214f3c");
      expect(primary.props.style?.color).toBe("#ffffff");

      const secondary = Button({ children: "S", variant: "secondary" });
      expect(secondary.props.style?.background).toBe("#e5eee6");
      expect(secondary.props.style?.color).toBe("#214f3c");

      const outline = Button({ children: "O", variant: "outline" });
      expect(outline.props.style?.background).toBe("transparent");
      expect(outline.props.style?.border).toBe("1px solid #214f3c");

      const ghost = Button({ children: "G", variant: "ghost" });
      expect(ghost.props.style?.background).toBe("transparent");
      expect(ghost.props.style?.border).toBe("none");
    });

    it("supports sizes sm, md, lg", () => {
      const sm = Button({ children: "SM", size: "sm" });
      expect(sm.props.style?.padding).toBe("8px 14px");
      expect(sm.props.style?.fontSize).toBe(13);

      const md = Button({ children: "MD", size: "md" });
      expect(md.props.style?.padding).toBe("12px 20px");
      expect(md.props.style?.fontSize).toBe(14);

      const lg = Button({ children: "LG", size: "lg" });
      expect(lg.props.style?.padding).toBe("16px 28px");
      expect(lg.props.style?.fontSize).toBe(15);
    });
  });

  describe("Stack", () => {
    it("renders flex container with column direction and default gap", () => {
      const stack = Stack({ children: "Items" });
      expect(stack.type).toBe("div");
      expect(stack.props.style?.display).toBe("flex");
      expect(stack.props.style?.flexDirection).toBe("column");
      expect(stack.props.style?.gap).toBe(16);
      expect(stack.props.children).toBe("Items");
    });

    it("supports direction row, custom gap, align, and justify", () => {
      const stack = Stack({
        children: "Items",
        direction: "row",
        gap: 24,
        align: "center",
        justify: "space-between",
      });
      expect(stack.props.style?.flexDirection).toBe("row");
      expect(stack.props.style?.gap).toBe(24);
      expect(stack.props.style?.alignItems).toBe("center");
      expect(stack.props.style?.justifyContent).toBe("space-between");
    });
  });

  describe("Grid", () => {
    it("renders css grid with responsive template columns and fallback", () => {
      const grid = Grid({ children: "Cards", columns: 3, gap: 24, minWidth: 280 });
      expect(grid.type).toBe("div");
      expect(grid.props.style?.display).toBe("grid");
      expect(grid.props.style?.gridTemplateColumns).toBe("repeat(auto-fit, minmax(min(280px, 100%), 1fr))");
      expect(grid.props.style?.gap).toBe(24);
      expect(grid.props.children).toBe("Cards");
    });
  });

  describe("VisuallyHidden", () => {
    it("renders sr-only content with default span tag", () => {
      const hidden = VisuallyHidden({ children: "Texto acessível" });
      expect(hidden.type).toBe("span");
      expect(hidden.props.style?.position).toBe("absolute");
      expect(hidden.props.style?.width).toBe(1);
      expect(hidden.props.style?.height).toBe(1);
      expect(hidden.props.style?.overflow).toBe("hidden");
      expect(hidden.props.style?.clip).toBe("rect(0, 0, 0, 0)");
      expect(hidden.props.style?.whiteSpace).toBe("nowrap");
      expect(hidden.props.style?.border).toBe(0);
      expect(hidden.props.children).toBe("Texto acessível");
    });

    it("supports rendering as div tag", () => {
      const hidden = VisuallyHidden({ children: "Texto div", as: "div" });
      expect(hidden.type).toBe("div");
      expect(hidden.props.children).toBe("Texto div");
    });
  });
});
