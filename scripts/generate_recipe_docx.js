const { PrismaClient } = require('@prisma/client');
const docx = require('docx');
const fs = require('fs');
const path = require('path');

const {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Packer,
  ShadingType
} = docx;

const prisma = new PrismaClient();

// Luxury Kogna Color Palette
const COLORS = {
  GOLD: 'D4AF37',
  GOLD_DARK: '996515',
  GOLD_LIGHT: 'F4E8C1',
  DARK: '1A1714',
  CHARCOAL: '2B2621',
  GRAY_LIGHT: 'F8F9FA',
  GRAY_BORDER: 'E2E8F0',
  WHITE: 'FFFFFF',
  GREEN: '2E7D32',
  TEXT_MUTED: '64748B'
};

function createHeaderCell(text, widthPercent = 25) {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: COLORS.CHARCOAL },
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: text,
            bold: true,
            color: COLORS.GOLD,
            font: 'Segoe UI',
            size: 20 // 10pt
          })
        ]
      })
    ]
  });
}

function createDataCell(text, alignment = AlignmentType.LEFT, widthPercent = 25, isAlternate = false, bold = false) {
  return new TableCell({
    width: { size: widthPercent, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: isAlternate ? 'FAFAF9' : COLORS.WHITE },
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [
      new Paragraph({
        alignment: alignment,
        children: [
          new TextRun({
            text: text,
            bold: bold,
            color: COLORS.DARK,
            font: 'Segoe UI',
            size: 19 // 9.5pt
          })
        ]
      })
    ]
  });
}

async function generateDocx() {
  console.log('🔄 Fetching recipes, menu items, and ingredients from database...');

  const recipes = await prisma.recipe.findMany({
    include: {
      menuItem: { select: { id: true, name: true, price: true, description: true, category: { select: { name: true } } } },
      ingredient: { select: { id: true, name: true, unit: true, costPerUnit: true } }
    },
    orderBy: [
      { menuItem: { category: { name: 'asc' } } },
      { menuItem: { name: 'asc' } }
    ]
  });

  const allIngredients = await prisma.ingredient.findMany({
    orderBy: { name: 'asc' }
  });

  const allMenuItems = await prisma.menuItem.findMany({
    include: { category: true },
    orderBy: [
      { category: { name: 'asc' } },
      { name: 'asc' }
    ]
  });

  // Group recipes by Category -> Menu Item
  const groupedByCat = {};
  const itemsWithRecipeSet = new Set();

  for (const r of recipes) {
    const catName = r.menuItem?.category?.name || 'Beverages';
    const itemName = r.menuItem?.name || 'Unknown Item';
    itemsWithRecipeSet.add(itemName);

    if (!groupedByCat[catName]) {
      groupedByCat[catName] = {};
    }

    if (!groupedByCat[catName][itemName]) {
      groupedByCat[catName][itemName] = {
        name: itemName,
        price: r.menuItem?.price || 0,
        description: r.menuItem?.description || '',
        ingredients: []
      };
    }

    const cost = (r.ingredient?.costPerUnit || 0) * (r.quantity || 0);
    groupedByCat[catName][itemName].ingredients.push({
      ingredientName: r.ingredient?.name || 'Ingredient',
      quantity: r.quantity,
      unit: r.ingredient?.unit || '',
      unitCost: r.ingredient?.costPerUnit || 0,
      totalCost: cost
    });
  }

  const itemsWithoutRecipe = allMenuItems.filter(m => !itemsWithRecipeSet.has(m.name));

  console.log(`📊 Statistics:
  - Total Configured Menu Recipes: ${itemsWithRecipeSet.size}
  - Total Recipe-Ingredient Links: ${recipes.length}
  - Total Inventory Ingredients: ${allIngredients.length}
  - Unconfigured Menu Items: ${itemsWithoutRecipe.length}`);

  const docChildren = [];

  // ==========================================
  // 1. COVER / HEADER SECTION
  // ==========================================
  docChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: 'KOGNA COFFEE',
          bold: true,
          font: 'Segoe UI',
          size: 48, // 24pt
          color: COLORS.GOLD_DARK
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: 'OFFICIAL RECIPE & INGREDIENT SPECIFICATIONS',
          bold: true,
          font: 'Segoe UI',
          size: 26, // 13pt
          color: COLORS.CHARCOAL
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: 'Standard Operating Procedures (SOP) • Barista Portions • Food Cost Analysis\nGenerated: October 2026 • POS Version 2.5.5',
          italics: true,
          font: 'Segoe UI',
          size: 20, // 10pt
          color: COLORS.TEXT_MUTED
        })
      ]
    })
  );

  // ==========================================
  // 2. EXECUTIVE SUMMARY BOX
  // ==========================================
  const summaryRows = [
    new TableRow({
      children: [
        createHeaderCell('METRIC', 40),
        createHeaderCell('VALUE / DETAILS', 60)
      ]
    }),
    new TableRow({
      children: [
        createDataCell('Total Active Menu Items', AlignmentType.LEFT, 40, false, true),
        createDataCell(`${allMenuItems.length} Items`, AlignmentType.LEFT, 60, false)
      ]
    }),
    new TableRow({
      children: [
        createDataCell('Items with Configured Recipes', AlignmentType.LEFT, 40, true, true),
        createDataCell(`${itemsWithRecipeSet.size} Items (Fully automated POS stock deduction)`, AlignmentType.LEFT, 60, true)
      ]
    }),
    new TableRow({
      children: [
        createDataCell('Items Awaiting Formulation', AlignmentType.LEFT, 40, false, true),
        createDataCell(`${itemsWithoutRecipe.length} Items (Listed in Appendix)`, AlignmentType.LEFT, 60, false)
      ]
    }),
    new TableRow({
      children: [
        createDataCell('Total Inventory Ingredients Tracked', AlignmentType.LEFT, 40, true, true),
        createDataCell(`${allIngredients.length} Ingredients`, AlignmentType.LEFT, 60, true)
      ]
    })
  ];

  docChildren.push(
    new Paragraph({
      spacing: { before: 200, after: 120 },
      children: [
        new TextRun({
          text: '1. Executive Summary',
          bold: true,
          font: 'Segoe UI',
          size: 28,
          color: COLORS.CHARCOAL
        })
      ]
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: summaryRows
    }),
    new Paragraph({ spacing: { after: 300 } })
  );

  // ==========================================
  // 3. MASTER INGREDIENTS TABLE
  // ==========================================
  docChildren.push(
    new Paragraph({
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({
          text: '2. Master Inventory Ingredients & Cost Price',
          bold: true,
          font: 'Segoe UI',
          size: 28,
          color: COLORS.CHARCOAL
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({
          text: 'The table below represents the raw ingredients currently registered in the Kogna POS database used for automatic stock deduction upon order completion.',
          font: 'Segoe UI',
          size: 20,
          color: COLORS.TEXT_MUTED
        })
      ]
    })
  );

  const ingTableRows = [
    new TableRow({
      children: [
        createHeaderCell('#', 8),
        createHeaderCell('INGREDIENT NAME', 35),
        createHeaderCell('UNIT', 17),
        createHeaderCell('STORE STOCK', 20),
        createHeaderCell('COST PER UNIT', 20)
      ]
    })
  ];

  allIngredients.forEach((ing, idx) => {
    const isAlt = idx % 2 === 1;
    ingTableRows.push(
      new TableRow({
        children: [
          createDataCell(String(idx + 1), AlignmentType.CENTER, 8, isAlt),
          createDataCell(ing.name, AlignmentType.LEFT, 35, isAlt, true),
          createDataCell(ing.unit, AlignmentType.CENTER, 17, isAlt),
          createDataCell(`${ing.quantity} ${ing.unit}`, AlignmentType.RIGHT, 20, isAlt),
          createDataCell(ing.costPerUnit > 0 ? `${ing.costPerUnit.toFixed(2)} ETB` : 'Not set', AlignmentType.RIGHT, 20, isAlt)
        ]
      })
    );
  });

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: ingTableRows
    }),
    new Paragraph({ spacing: { after: 350 } })
  );

  // ==========================================
  // 4. DETAILED RECIPES BY CATEGORY
  // ==========================================
  docChildren.push(
    new Paragraph({
      spacing: { before: 300, after: 150 },
      children: [
        new TextRun({
          text: '3. Standard Beverage & Food Recipes',
          bold: true,
          font: 'Segoe UI',
          size: 28,
          color: COLORS.CHARCOAL
        })
      ]
    })
  );

  for (const [catName, itemsMap] of Object.entries(groupedByCat)) {
    docChildren.push(
      new Paragraph({
        spacing: { before: 250, after: 120 },
        children: [
          new TextRun({
            text: `Category: ${catName}`,
            bold: true,
            font: 'Segoe UI',
            size: 24,
            color: COLORS.GOLD_DARK
          })
        ]
      })
    );

    const recipeRows = [
      new TableRow({
        children: [
          createHeaderCell('MENU ITEM', 26),
          createHeaderCell('SELLING PRICE', 16),
          createHeaderCell('REQUIRED INGREDIENTS & PORTION', 38),
          createHeaderCell('EST. FOOD COST', 20)
        ]
      })
    ];

    let rowIdx = 0;
    for (const [itemName, itemData] of Object.entries(itemsMap)) {
      const isAlt = rowIdx % 2 === 1;
      rowIdx++;

      let totalFoodCost = 0;
      const ingLines = itemData.ingredients.map(ing => {
        totalFoodCost += ing.totalCost;
        const costStr = ing.totalCost > 0 ? ` (~${ing.totalCost.toFixed(2)} ETB)` : '';
        return `• ${ing.ingredientName}: ${ing.quantity} ${ing.unit}${costStr}`;
      }).join('\n');

      const profit = itemData.price - totalFoodCost;
      const margin = itemData.price > 0 ? ((profit / itemData.price) * 100).toFixed(0) : '0';

      recipeRows.push(
        new TableRow({
          children: [
            createDataCell(itemData.name, AlignmentType.LEFT, 26, isAlt, true),
            createDataCell(`${itemData.price.toFixed(2)} ETB`, AlignmentType.RIGHT, 16, isAlt, true),
            createDataCell(ingLines, AlignmentType.LEFT, 38, isAlt),
            createDataCell(
              totalFoodCost > 0 
                ? `${totalFoodCost.toFixed(2)} ETB\n(Margin: ${margin}%)` 
                : 'Raw stock only',
              AlignmentType.RIGHT,
              20,
              isAlt
            )
          ]
        })
      );
    }

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: recipeRows
      }),
      new Paragraph({ spacing: { after: 200 } })
    );
  }

  // ==========================================
  // 5. UNCONFIGURED ITEMS (APPENDIX)
  // ==========================================
  docChildren.push(
    new Paragraph({
      spacing: { before: 300, after: 120 },
      children: [
        new TextRun({
          text: '4. Menu Items Awaiting Recipe Formulation',
          bold: true,
          font: 'Segoe UI',
          size: 28,
          color: COLORS.CHARCOAL
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({
          text: 'The following menu items are currently active in the POS but do not yet have ingredient portions registered in the recipe table. Stock is not automatically deducted for these items until recipe formulations are entered.',
          font: 'Segoe UI',
          size: 20,
          color: COLORS.TEXT_MUTED
        })
      ]
    })
  );

  const pendingRows = [
    new TableRow({
      children: [
        createHeaderCell('#', 8),
        createHeaderCell('MENU ITEM', 40),
        createHeaderCell('CATEGORY', 25),
        createHeaderCell('PRICE (ETB)', 27)
      ]
    })
  ];

  itemsWithoutRecipe.forEach((item, idx) => {
    const isAlt = idx % 2 === 1;
    pendingRows.push(
      new TableRow({
        children: [
          createDataCell(String(idx + 1), AlignmentType.CENTER, 8, isAlt),
          createDataCell(item.name, AlignmentType.LEFT, 40, isAlt, true),
          createDataCell(item.category?.name || 'General', AlignmentType.LEFT, 25, isAlt),
          createDataCell(`${item.price.toFixed(2)} ETB`, AlignmentType.RIGHT, 27, isAlt)
        ]
      })
    );
  });

  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: pendingRows
    }),
    new Paragraph({ spacing: { after: 400 } })
  );

  // Build document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1000,
              bottom: 1000,
              left: 1000,
              right: 1000
            }
          }
        },
        children: docChildren
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);

  // Write to paths
  const targetPath1 = path.resolve('c:/Users/dawit/OneDrive/Documents/managment/FBC/Kogna_Coffee_Recipe_Book.docx');
  const targetPath2 = path.resolve('c:/Users/dawit/OneDrive/Documents/k/k/Kogna Coffee POS/Kogna_Coffee_Recipe_Book.docx');
  const artifactPath = path.resolve('C:/Users/dawit/.gemini/antigravity-ide/brain/877f14f4-bd22-45b7-8f01-d2c675613453/Kogna_Coffee_Recipe_Book.docx');

  fs.writeFileSync(targetPath1, buffer);
  console.log(`✅ Saved Word Document to: ${targetPath1}`);

  try {
    fs.writeFileSync(targetPath2, buffer);
    console.log(`✅ Saved Word Document to Obsidian Vault: ${targetPath2}`);
  } catch (err) {
    console.warn(`Could not write to Obsidian vault: ${err.message}`);
  }

  try {
    fs.writeFileSync(artifactPath, buffer);
    console.log(`✅ Saved Word Document to Artifacts: ${artifactPath}`);
  } catch (err) {}

  console.log('🎉 Word Document generated successfully!');
}

generateDocx().catch(console.error).finally(() => prisma.$disconnect());
