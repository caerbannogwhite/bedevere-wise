# Brian

A simple and powerful spreadsheet data viewer for CDISC clinical trial data, built with TypeScript. Brian provides interactive visualizations for clinical research data with features like multi-dataset support, column statistics, and responsive design.

## Features

- 📊 **Multi-dataset visualization** with tabbed interface
- 📈 **Column statistics** and data analysis
- 🎨 **Responsive design** that works on all screen sizes
- 🔧 **TypeScript support** with full type definitions
- ⚡ **High performance** with virtual scrolling
- 🎯 **Easy integration** with existing applications

## Demo

![Demo](./media/brian-demo-base.gif)
![Demo](./media/brian-demo-export.gif)

## Development

### Prerequisites

- [Bun](https://bun.sh/) (latest version)
- Node.js (for examples)

### Setup

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Build for production
bun run build

# Build library for NPM
bun run build:lib
```

### Project Structure

```
brian/
├── src/
│   ├── components/          # UI components
│   │   ├── MultiDatasetVisualizer/
│   │   ├── DatasetPanel/
│   │   └── SpreadsheetVisualizer/
│   ├── data/               # Data types and providers
│   └── styles/             # SCSS styles
├── example/                # Usage examples
├── dist/                   # Built library (generated)
└── docs/                   # Documentation
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

See [CHANGELOG](CHANGELOG) for version history and updates.
