import * as d3 from "d3";
import * as cmk_figures from "cmk_figures";

// Used for rapid protoyping, bypassing webpack
// var cmk_figures = cmk.figures; /* eslint-disable-line no-undef */
// var dc = dc; /* eslint-disable-line no-undef */
// var d3 = d3; /* eslint-disable-line no-undef */
// var crossfilter = crossfilter; /* eslint-disable-line no-undef */

class GaugeFigure extends cmk_figures.FigureBase {
    static ident() {
        return "gauge";
    }

    constructor(div_selector, fixed_size = null) {
        super(div_selector, fixed_size);
        this._tag_dimension = this._crossfilter.dimension(d => d.tag);
        this.margin = {top: 10, right: 10, bottom: 10, left: 10};
    }

    initialize(debug) {
        if (debug) this._add_scheduler_debugging();
        this.svg = this._div_selection.append("svg");
        this.plot = this.svg.append("g");
    }

    resize() {
        if (this._data.title) {
            this.margin.top = 10 + 24; // 24 from UX project
        } else {
            this.margin.top = 10;
        }

        cmk_figures.FigureBase.prototype.resize.call(this);
        this.svg.attr("width", this.figure_size.width).attr("height", this.figure_size.height);
        this._radius = Math.min(this.plot_size.width / 2, (3 / 4) * this.plot_size.height);
        this.plot.attr(
            "transform",
            "translate(" +
                (this.plot_size.width / 2 + this.margin.left) +
                ", " +
                (this._radius + this.margin.top) +
                ")"
        );
        this._render_fixed_elements();
    }

    update_gui() {
        this._crossfilter.remove(() => true);
        this._crossfilter.add(this._data.data);

        let filter_tag = null;
        if (this._data.plot_definitions && this._data.plot_definitions.length > 0)
            filter_tag = this._data.plot_definitions[this._data.plot_definitions.length - 1]
                .use_tags[0];
        this._tag_dimension.filter(d => d == filter_tag);

        this.resize();
        this.render();
    }

    render() {
        this._render_levels();
        this._render_text();
        this.render_title(this._data.title);

        let plot = this._data.plot_definitions.filter(d => d.plot_type == "single_value")[0];
        if (!plot) return;
        cmk_figures.state_component(this, plot.svc_state);
    }

    _calculate_domain() {
        const [lower, upper] = d3.extent(this._crossfilter.allFiltered(), d => d.value);
        return [lower + upper * (1 - 1 / 0.95), upper / 0.95];
    }

    _calculate_domain_and_levels(domain) {
        let [dmin, dmax] = domain;

        let plot = this._data.plot_definitions.filter(d => d.plot_type == "single_value")[0];
        if (!plot || !plot.metrics) return [domain, []];

        let metrics = plot.metrics;
        if (metrics.max != null && metrics.max <= dmax) dmax = metrics.max;
        if (metrics.min != null && dmin <= metrics.min) dmin = metrics.min;

        if (metrics.warn == null || metrics.warn >= dmax) metrics.warn = dmax;
        if (metrics.crit == null || metrics.crit >= dmax) metrics.crit = dmax;

        return [
            [dmin, dmax],
            [
                {from: dmin, to: metrics.warn, color: "green"},
                {
                    from: metrics.warn,
                    to: metrics.crit,
                    color: "yellow",
                },
                {from: metrics.crit, to: dmax, color: "red"},
            ],
        ];
    }

    _render_fixed_elements() {
        const limit = (7 * Math.PI) / 12;
        this.plot
            .selectAll("path.background")
            .data([null])
            .join(enter => enter.append("path").classed("background", true))
            .attr("fill", "grey")
            .attr("opacity", 0.1)
            .attr(
                "d",
                d3
                    .arc()
                    .innerRadius(this._radius * 0.75)
                    .outerRadius(this._radius * 0.85)
                    .startAngle(-limit)
                    .endAngle(limit)
            );
    }
    _render_gauge_range_labels(domain) {
        let limit = (15 * Math.PI) / 24;
        let label_rad = 0.8 * this._radius;
        let domain_labels = [
            {
                value: domain[0].toFixed(2),
                y: -label_rad * Math.cos(limit),
                x: label_rad * Math.sin(-limit),
            },
            {
                value: domain[1].toFixed(2),
                y: -label_rad * Math.cos(limit),
                x: label_rad * Math.sin(limit),
            },
        ];

        this.plot
            .selectAll("text.range")
            .data(domain_labels)
            .join("text")
            .classed("range", true)
            .text(d => d.value)
            .attr("text-anchor", "middle")
            .style("font-size", "12px")
            .attr("x", d => d.x)
            .attr("y", d => d.y);
    }

    _render_levels() {
        let [domain, levels] = this._calculate_domain_and_levels(this._calculate_domain());
        this._render_gauge_range_labels(domain);

        let limit = (7 * Math.PI) / 12;
        const scale_x = d3.scaleLinear().domain(domain).range([-limit, limit]);
        this.plot
            .selectAll("path.level")
            .data(levels)
            .join(enter => enter.append("path").classed("level", true))
            .attr("fill", d => d.color)
            .attr("opacity", 0.9)
            .attr(
                "d",
                d3
                    .arc()
                    .innerRadius(this._radius * 0.75)
                    .outerRadius(this._radius * 0.76)
                    .startAngle(d => scale_x(d.from))
                    .endAngle(d => scale_x(d.to))
            )
            .selectAll("title")
            .data(d => [d])
            .join("title")
            .text(d => d.from + " -> " + d.to);

        const data = this._crossfilter.allFiltered();
        if (!data.length) return;
        const value = data[data.length - 1].value;
        const bar = {
            value: value,
            color: levels.find(element => value < element.to).color,
        };
        // gauge bar
        this.plot
            .selectAll("path.value")
            .data([bar])
            .join(enter => enter.append("path").classed("value", true))
            .attr("fill", d => d.color)
            .attr("opacity", 0.9)
            .attr(
                "d",
                d3
                    .arc()
                    .innerRadius(this._radius * 0.77)
                    .outerRadius(this._radius * 0.85)
                    .startAngle(d => -limit)
                    .endAngle(d => scale_x(d.value))
            );

        this._render_histogram(domain, data);
    }

    _render_histogram(domain, data) {
        let num_bins = 20;
        const x = d3.scaleLinear().domain([0, num_bins]).range(domain);
        const bins = d3
            .histogram()
            .value(d => d.value)
            .thresholds(d3.range(num_bins).map(x))
            .domain(x.range())(data);

        let record_count = data.length;
        const innerRadius = this._radius * 0.85;
        const bin_scale = d3
            .scaleLinear()
            .domain([0, d3.max(bins, d => d.length)])
            .range([innerRadius, this._radius]);
        const limit = (7 * Math.PI) / 12;
        const angle_between_bins = (2 * limit) / bins.length;
        this.plot
            .selectAll("path.bin")
            .data(bins)
            .join(enter => enter.append("path").classed("bin", true))
            .attr("fill", "steelblue")
            .attr("stroke", d => (d.length > 0 ? "black" : null))
            .attr(
                "d",
                d3
                    .arc()
                    .innerRadius(innerRadius)
                    .outerRadius(d => bin_scale(d.length) + (d.length > 0 ? 2 : 0))
                    .startAngle((d, idx) => -limit + idx * angle_between_bins)
                    .endAngle((d, idx) => -limit + (idx + 1) * angle_between_bins)
            )
            .selectAll("title")
            .data(d => [d])
            .join("title")
            .text(d => {
                let title = "";
                if (d.length == 0) return title;
                title += ((100.0 * d.length) / record_count).toPrecision(3);
                title += "%: " + d.x0.toPrecision(3);
                title += " -> " + d.x1.toPrecision(3);
                return title;
            });
    }

    _render_text() {
        let data = this._crossfilter.allFiltered();
        if (data.length) {
            let value = cmk_figures.split_unit(data[data.length - 1]);
            cmk_figures.metric_value_component(
                this.plot,
                value,
                this._radius / 3.5,
                0,
                -this._radius / 5
            );
        }
    }
}

cmk_figures.figure_registry.register(GaugeFigure);
